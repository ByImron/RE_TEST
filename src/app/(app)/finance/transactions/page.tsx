"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { SetupNotice } from "@/components/SetupNotice";
import { ExportMenu } from "@/components/ExportMenu";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  Chip,
  ChipGroup,
  ControlGroup,
  ExpandSearch,
  FILTER_SELECT,
  FilterSection,
  IconAction,
  ListToolbar,
  TrashAction,
  type ActiveFilter,
} from "@/components/ActionBar";
import { LockIcon, PencilIcon, TagIcon } from "@/components/icons";
import { formatShortDate } from "@/lib/formatDate";
import { categoryLabel, type FinanceEntry, type FinanceKind } from "@/lib/finance/types";
import { useFinance } from "@/components/finance/FinanceContext";
import { CategoriesModal } from "@/components/finance/CategoriesModal";
import { Money, toneFor } from "@/components/finance/FinanceParts";
import {
  AddEntryAction,
  FinanceFilter,
  FinanceTabs,
  useCommonFilterState,
} from "@/components/finance/FinanceToolbarParts";

// The journal is read a page at a time and never counted: with tens of
// thousands of entries a running "page 7 of 900" (an OFFSET plus an exact
// count) gets slower with every year. Each page continues from the last row
// on screen -- "older than this date, or the same date and a smaller id" --
// which is one index lookup wherever you are in the list.
const PAGE_SIZE = 50;
const EXPORT_BATCH = 1000;

// created_by_label (who entered the row) exists only once the database has been
// updated; until then the journal is read without it rather than not at all.
const columns = (withAuthor: boolean) =>
  `id, kind, occurred_on, amount, currency, category_id, building_id, counterparty, note, title, quantity, unit, unit_price, contract_payment_id, ${
    withAuthor ? "created_by_label, " : ""
  }category:finance_categories(name, code), building:buildings(name)`;

// Characters that mean something inside a PostgREST filter string.
const cleanSearch = (raw: string) => raw.replace(/[,()*%\\]/g, " ").trim().toLowerCase();

// The few filter methods the list query uses, without dragging in the query
// builder's full (very deep) type.
type FilterBuilder = {
  eq(column: string, value: string): FilterBuilder;
  is(column: string, value: null): FilterBuilder;
  gte(column: string, value: string): FilterBuilder;
  lte(column: string, value: string): FilterBuilder;
  ilike(column: string, pattern: string): FilterBuilder;
  or(filters: string): FilterBuilder;
};

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 });

export default function FinanceEntriesPage() {
  const { t } = useLocale();
  const confirm = useConfirm();
  const configured = isSupabaseConfigured();
  const { range, buildingId, canManage, categories, version, bump, setupMissing, editEntry } = useFinance();
  const common = useCommonFilterState();

  const [kind, setKind] = useState<"all" | FinanceKind>("all");
  const [categoryId, setCategoryId] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);

  const [rows, setRows] = useState<FinanceEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [withAuthor, setWithAuthor] = useState(true);

  const [managingCategories, setManagingCategories] = useState(false);

  const queryKey = [kind, categoryId, search, range.from, range.to, buildingId, version, withAuthor].join("|");
  const loading = configured && !setupMissing && loadedKey !== queryKey;
  const currentKey = useRef(queryKey);
  currentKey.current = queryKey;

  // The one place a list query is built, so the page, "show more" and the
  // export can never disagree about what "the current list" is.
  const buildQuery = (cursor: { occurred_on: string; id: string } | null, limit: number) => {
    let q = createClient()
      .schema("crm")
      .from("finance_entries")
      .select(columns(withAuthor)) as unknown as FilterBuilder;
    if (range.from) q = q.gte("occurred_on", range.from);
    if (range.to) q = q.lte("occurred_on", range.to);
    if (buildingId === "none") q = q.is("building_id", null);
    else if (buildingId !== "all") q = q.eq("building_id", buildingId);
    if (kind !== "all") q = q.eq("kind", kind);
    if (categoryId !== "all") q = q.eq("category_id", categoryId);
    const needle = cleanSearch(search);
    if (needle) q = q.ilike("search_text", `%${needle}%`);
    if (cursor) {
      q = q.or(
        `occurred_on.lt.${cursor.occurred_on},and(occurred_on.eq.${cursor.occurred_on},id.lt.${cursor.id})`
      );
    }
    return (
      q as unknown as {
        order(c: string, o: { ascending: boolean }): {
          order(c: string, o: { ascending: boolean }): {
            limit(n: number): PromiseLike<{ data: unknown; error: { message: string } | null }>;
          };
        };
      }
    )
      .order("occurred_on", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
  };

  useEffect(() => {
    if (!configured || setupMissing) return;
    let cancelled = false;
    buildQuery(null, PAGE_SIZE + 1).then(({ data, error }) => {
      if (cancelled) return;
      if (error && withAuthor && /created_by_label/.test(error.message)) {
        setWithAuthor(false);
        return;
      }
      if (error) {
        console.error("finance_entries failed:", error.message);
        setFailure(error.message);
        setRows([]);
        setHasMore(false);
      } else {
        const batch = (data ?? []) as unknown as FinanceEntry[];
        setFailure(null);
        setRows(batch.slice(0, PAGE_SIZE));
        setHasMore(batch.length > PAGE_SIZE);
      }
      setLoadedKey(queryKey);
    });
    return () => {
      cancelled = true;
    };
    // buildQuery is rebuilt every render from exactly the values in queryKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, setupMissing, queryKey]);

  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!last || loadingMore) return;
    const key = queryKey;
    setLoadingMore(true);
    const { data, error } = await buildQuery(
      { occurred_on: last.occurred_on, id: last.id },
      PAGE_SIZE + 1
    );
    setLoadingMore(false);
    // The filters changed while this was in flight: it belongs to another list.
    if (currentKey.current !== key) return;
    if (error) {
      setFailure(error.message);
      return;
    }
    const batch = (data ?? []) as unknown as FinanceEntry[];
    setRows((prev) => [...prev, ...batch.slice(0, PAGE_SIZE)]);
    setHasMore(batch.length > PAGE_SIZE);
  };

  const categoryOptions = categories.filter((c) => kind === "all" || c.kind === kind);
  const kindLabel = { all: t.finance.allKinds, income: t.finance.income, expense: t.finance.expense };

  const activeFilters: ActiveFilter[] = [
    ...common.chips,
    ...(kind !== "all"
      ? [{ key: "kind", label: kindLabel[kind], onRemove: () => setKind("all") }]
      : []),
    ...(categoryId !== "all"
      ? [
          {
            key: "category",
            label: categoryLabel(
              categories.find((c) => c.id === categoryId) ?? null,
              t.finance.categories.contractPayments,
              t.finance.category
            ),
            onRemove: () => setCategoryId("all"),
          },
        ]
      : []),
  ];
  const resetExtra = () => {
    setKind("all");
    setCategoryId("all");
  };
  const resetAll = () => {
    common.reset();
    resetExtra();
  };

  const getExportRows = async () => {
    const out: Array<Array<string | number | null>> = [];
    let cursor: { occurred_on: string; id: string } | null = null;
    for (;;) {
      const { data } = await buildQuery(cursor, EXPORT_BATCH);
      const batch = (data ?? []) as unknown as FinanceEntry[];
      for (const e of batch) {
        out.push([
          formatShortDate(e.occurred_on),
          e.kind === "income" ? t.finance.income : t.finance.expense,
          categoryLabel(e.category, t.finance.categories.contractPayments, ""),
          e.building?.name ?? t.finance.companyWide,
          e.title ?? "",
          e.quantity,
          e.unit ?? "",
          e.unit_price,
          e.counterparty ?? "",
          e.note ?? "",
          e.kind === "income" ? e.amount : -e.amount,
          e.currency,
        ]);
      }
      if (batch.length < EXPORT_BATCH) break;
      const last: FinanceEntry = batch[batch.length - 1];
      cursor = { occurred_on: last.occurred_on, id: last.id };
    }
    return out;
  };

  const remove = async (entry: FinanceEntry) => {
    const ok = await confirm(t.finance.deleteConfirm, { danger: true });
    if (!ok) return;
    const { error } = await createClient().schema("crm").from("finance_entries").delete().eq("id", entry.id);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    setDeleteError(null);
    bump();
  };

  return (
    <div className="flex flex-col gap-4">
      {!configured && <SetupNotice />}

      <ListToolbar filters={activeFilters} onClearAll={resetAll} clearLabel={t.common.resetFilters}>
        <FinanceTabs />
        <ExpandSearch value={searchInput} onChange={setSearchInput} placeholder={t.finance.search} />
        <FinanceFilter
          extraCount={(kind !== "all" ? 1 : 0) + (categoryId !== "all" ? 1 : 0)}
          onResetExtra={resetExtra}
          extra={
            <>
              <FilterSection label={t.finance.form.kind}>
                <ChipGroup>
                  {(["all", "income", "expense"] as const).map((k) => (
                    <Chip
                      key={k}
                      label={kindLabel[k]}
                      active={kind === k}
                      onClick={() => {
                        setKind(k);
                        // a category belongs to one direction
                        setCategoryId("all");
                      }}
                    />
                  ))}
                </ChipGroup>
              </FilterSection>
              <FilterSection label={t.finance.category}>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={FILTER_SELECT}
                >
                  <option value="all">{t.finance.allCategories}</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryLabel(c, t.finance.categories.contractPayments, c.name)}
                    </option>
                  ))}
                </select>
              </FilterSection>
            </>
          }
        />

        <ControlGroup wrap>
          <ExportMenu
            bare
            getData={getExportRows}
            headers={[
              t.finance.table.date,
              t.finance.form.kind,
              t.finance.category,
              t.finance.building,
              t.finance.form.titleExpense,
              t.finance.form.quantity,
              t.finance.form.unit,
              t.finance.form.unitPrice,
              t.finance.table.counterparty,
              t.finance.form.note,
              t.finance.form.total,
              t.finance.form.currency,
            ]}
            filenameBase="finance"
            title={t.finance.title}
          />
          {canManage && (
            <>
              <IconAction
                label={t.finance.categories.manage}
                icon={<TagIcon />}
                onClick={() => setManagingCategories(true)}
              />
            </>
          )}
          {/* export and the categories, then the page's one yellow "+" glued on, as on the clients page */}
          <AddEntryAction divider />
        </ControlGroup>
      </ListToolbar>

      {(failure || deleteError) && (
        <p role="alert" className="rounded-lg bg-[var(--wash-rose)] px-4 py-3 text-sm text-[var(--wash-rose-ink)]">
          {deleteError ?? t.finance.loadFailed}
        </p>
      )}

      {/* Table from tablet width up; on a phone each entry is a card. */}
      <div className="animate-fade-up hidden overflow-x-auto rounded-lg border border-[var(--border-c)] bg-[var(--surface-1)] sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border-c)] text-[var(--ink-4)]">
            <tr>
              <th className="px-4 py-3 font-medium">{t.finance.table.date}</th>
              <th className="px-4 py-3 font-medium">{t.finance.table.item}</th>
              <th className="px-4 py-3 font-medium">{t.finance.building}</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">{t.finance.table.qty}</th>
              <th className="px-4 py-3 text-right font-medium">{t.finance.form.total}</th>
              <th className="w-24 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--ink-5)]">
                  {t.common.loading}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--ink-5)]">
                  {t.finance.empty}
                </td>
              </tr>
            )}
            {rows.map((e) => {
              const editable = canManage && !e.contract_payment_id;
              return (
                <tr
                  key={e.id}
                  onClick={editable ? () => editEntry(e) : undefined}
                  className={`border-b border-[var(--border-c2)] transition-colors last:border-0 hover:bg-[var(--hover-c)] ${
                    editable ? "cursor-pointer" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-[var(--ink-3)]">
                    {formatShortDate(e.occurred_on)}
                  </td>
                  <td className="max-w-[22rem] px-4 py-2.5">
                    <ItemCell entry={e} />
                  </td>
                  <td className="px-4 py-2.5 text-[var(--ink-3)]">
                    {e.building?.name ?? <span className="text-[var(--ink-5)]">{t.finance.companyWide}</span>}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-[var(--ink-4)] lg:table-cell">
                    <QtyPrice entry={e} />
                  </td>
                  <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold ${toneFor(e.kind === "income" ? 1 : -1)}`}>
                    <Money value={e.kind === "income" ? e.amount : -e.amount} currency={e.currency} signed />
                  </td>
                  <td className="px-2 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                    <RowActions
                      entry={e}
                      editable={editable}
                      onEdit={() => editEntry(e)}
                      onDelete={() => void remove(e)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 sm:hidden">
        {loading && rows.length === 0 && <li className="py-4 text-center text-[var(--ink-5)]">{t.common.loading}</li>}
        {!loading && rows.length === 0 && <li className="py-6 text-center text-[var(--ink-5)]">{t.finance.empty}</li>}
        {rows.map((e) => {
          const editable = canManage && !e.contract_payment_id;
          return (
            <li
              key={e.id}
              onClick={editable ? () => editEntry(e) : undefined}
              className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-c)] bg-[var(--surface-1)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <ItemCell entry={e} />
                </div>
                <span className={`shrink-0 text-sm font-bold ${toneFor(e.kind === "income" ? 1 : -1)}`}>
                  <Money value={e.kind === "income" ? e.amount : -e.amount} currency={e.currency} signed />
                </span>
              </div>
              <p className="text-xs text-[var(--ink-4)]">
                {formatShortDate(e.occurred_on)} · {e.building?.name ?? t.finance.companyWide}
                {e.quantity != null && (e.quantity !== 1 || e.unit) ? (
                  <>
                    {" · "}
                    <QtyPrice entry={e} />
                  </>
                ) : null}
              </p>
              <div className="flex justify-end" onClick={(ev) => ev.stopPropagation()}>
                <RowActions
                  entry={e}
                  editable={editable}
                  onEdit={() => editEntry(e)}
                  onDelete={() => void remove(e)}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {rows.length > 0 && (
        <div className="flex flex-col items-center gap-2 py-1">
          <p className="text-xs text-[var(--ink-5)]">{t.finance.shown.replace("{n}", String(rows.length))}</p>
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="btn btn-secondary btn-md"
            >
              {loadingMore ? t.common.loading : t.finance.loadMore}
            </button>
          )}
        </div>
      )}

      {managingCategories && <CategoriesModal onClose={() => setManagingCategories(false)} />}
    </div>
  );
}

// What the money was for: the name first, then the category, the counterparty
// and the note in a quiet line. Older entries (no name) lead with the category.
function ItemCell({ entry }: { entry: FinanceEntry }) {
  const { t } = useLocale();
  const categoryName = categoryLabel(entry.category, t.finance.categories.contractPayments, t.finance.noCategory);
  const primary = entry.title || entry.counterparty || categoryName;
  // The category is always shown (unless it already is the headline), so a row
  // never hides what kind of money it is -- payments from contracts included.
  const secondary = [
    entry.category ? categoryName : null,
    entry.title ? entry.counterparty : null,
    entry.note,
    // Who entered it -- stamped by the database, so it cannot be changed after.
    entry.created_by_label ? t.finance.enteredBy.replace("{name}", entry.created_by_label) : null,
  ].filter((x, i, a): x is string => !!x && a.indexOf(x) === i && x !== primary);
  return (
    <div className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${entry.kind === "income" ? "bg-emerald-500" : "bg-rose-500"}`}
      />
      <div className="min-w-0">
        <p className="truncate font-medium text-[var(--ink-1)]">{primary}</p>
        {secondary.length > 0 && <p className="truncate text-xs text-[var(--ink-5)]">{secondary.join(" · ")}</p>}
      </div>
    </div>
  );
}

function QtyPrice({ entry }: { entry: FinanceEntry }) {
  if (entry.quantity == null || entry.unit_price == null) return <span className="text-[var(--ink-5)]">—</span>;
  return (
    <span className="tabular-nums">
      {numberFormat.format(entry.quantity)}
      {entry.unit ? ` ${entry.unit}` : ""} × {numberFormat.format(entry.unit_price)}
    </span>
  );
}

function RowActions({
  entry,
  editable,
  onEdit,
  onDelete,
}: {
  entry: FinanceEntry;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  if (entry.contract_payment_id) {
    return (
      <span
        title={t.finance.fromContractHint}
        className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md bg-[var(--hover-c2)] px-2 text-[11px] font-semibold text-[var(--ink-4)]"
      >
        <LockIcon className="h-3 w-3" />
        {t.finance.fromContract}
      </span>
    );
  }
  if (!editable) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      <IconAction label={t.finance.editEntry} icon={<PencilIcon />} size="sm" onClick={onEdit} />
      <TrashAction label={t.finance.deleteEntry} onClick={onDelete} />
    </span>
  );
}
