"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useConfirm } from "@/components/ConfirmDialog";
import { IconAction, TrashAction } from "@/components/ActionBar";
import { ArrowDownLeftIcon, ArrowUpRightIcon, PencilIcon, TagIcon } from "@/components/icons";
import { formatShortDate } from "@/lib/formatDate";
import type { AdvancePerson, FinanceEntry, LedgerEvent } from "@/lib/finance/types";
import { categoryLabel } from "@/lib/finance/types";
import { useFinance } from "@/components/finance/FinanceContext";
import { AdvanceModal } from "@/components/finance/AdvanceModal";
import { Money, toneFor } from "@/components/finance/FinanceParts";

const PAGE = 50;
const CARD = "rounded-2xl border border-[var(--border-c)] bg-[var(--surface-1)] shadow-sm";

// Everything about ONE accountable person in one place: their balance, the two
// buttons that move money, and their whole history (advances and expenses,
// interleaved by date) -- instead of a balance here and their entries buried in
// the ordinary journal with a filter. Picking someone from the list at the top
// swaps the panel below; the ledger itself is paginated by crm.finance_person_ledger
// (keyset, same idea as the main journal -- see the block's own comment for why
// that matters once one person alone has thousands of rows).
export default function FinanceAdvancesPage() {
  const { t } = useLocale();
  const configured = isSupabaseConfigured();
  const { canManage, version, bump, setupMissing, editEntry } = useFinance();

  const [people, setPeople] = useState<AdvancePerson[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [modal, setModal] = useState<{ personId?: string; mode: "give" | "return" } | null>(null);

  useEffect(() => {
    if (!configured || setupMissing) return;
    let cancelled = false;
    createClient()
      .schema("crm")
      .rpc("finance_advance_people")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("finance advance people failed:", error.message);
          setLoadFailed(true);
          return;
        }
        setLoadFailed(false);
        const list = (data ?? []) as AdvancePerson[];
        setPeople(list);
        setSelected((prev) => (prev && list.some((p) => p.id === prev) ? prev : (list[0]?.id ?? null)));
      });
    return () => {
      cancelled = true;
    };
  }, [configured, setupMissing, version]);

  const person = people?.find((p) => p.id === selected) ?? null;

  return (
    <div className="flex flex-col gap-5">
      {loadFailed && (
        <p role="alert" className="rounded-lg bg-[var(--wash-rose)] px-4 py-3 text-sm text-[var(--wash-rose-ink)]">
          {t.finance.loadFailed}
        </p>
      )}

      <p className="max-w-2xl text-sm text-[var(--ink-4)]">{t.finance.advances.hint}</p>

      {people && people.length === 0 && (
        <p className={`${CARD} px-5 py-8 text-center text-sm text-[var(--ink-4)]`}>{t.finance.advances.emptyPeople}</p>
      )}

      {people && people.length > 1 && (
        <div role="tablist" aria-label={t.finance.advances.people} className="flex flex-wrap gap-2">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={selected === p.id}
              onClick={() => setSelected(p.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                selected === p.id
                  ? "bg-[#18181b] text-[var(--accent-yellow)] dark:bg-[var(--accent-yellow)] dark:text-[#18181b]"
                  : "bg-[var(--surface-1)] text-[var(--ink-3)] hover:bg-[var(--hover-c2)]"
              }`}
            >
              {p.email}
            </button>
          ))}
        </div>
      )}

      {person && (
        <PersonPanel
          key={person.id}
          person={person}
          canManage={canManage}
          onGive={() => setModal({ personId: person.id, mode: "give" })}
          onReturn={() => setModal({ personId: person.id, mode: "return" })}
          onEditEntry={editEntry}
          version={version}
          bump={bump}
        />
      )}

      {modal && people && (
        <AdvanceModal
          people={people}
          initialPersonId={modal.personId}
          initialMode={modal.mode}
          onClose={() => setModal(null)}
          onSaved={bump}
        />
      )}
    </div>
  );
}

function PersonPanel({
  person,
  canManage,
  onGive,
  onReturn,
  onEditEntry,
  version,
  bump,
}: {
  person: AdvancePerson;
  canManage: boolean;
  onGive: () => void;
  onReturn: () => void;
  onEditEntry: (entry: FinanceEntry) => void;
  version: number;
  bump: () => void;
}) {
  const { t } = useLocale();
  const confirm = useConfirm();

  const [rows, setRows] = useState<LedgerEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const queryKey = `${person.id}|${version}`;
  const loading = loadedKey !== queryKey;

  useEffect(() => {
    let cancelled = false;
    createClient()
      .schema("crm")
      .rpc("finance_person_ledger", { p_person_id: person.id, p_limit: PAGE + 1 })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setFailure(error.message);
        } else {
          const batch = (data ?? []) as LedgerEvent[];
          setFailure(null);
          setRows(batch.slice(0, PAGE));
          setHasMore(batch.length > PAGE);
        }
        setLoadedKey(queryKey);
      });
    return () => {
      cancelled = true;
    };
    // queryKey is derived from person.id and version, both already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id, version]);

  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    const { data, error } = await createClient()
      .schema("crm")
      .rpc("finance_person_ledger", {
        p_person_id: person.id,
        p_before_date: last.when_date,
        p_before_created_at: last.created_at,
        p_before_id: last.id,
        p_limit: PAGE + 1,
      });
    setLoadingMore(false);
    if (error) {
      setFailure(error.message);
      return;
    }
    const batch = (data ?? []) as LedgerEvent[];
    setRows((prev) => [...prev, ...batch.slice(0, PAGE)]);
    setHasMore(batch.length > PAGE);
  };

  const asEntry = (r: LedgerEvent): FinanceEntry => ({
    id: r.id,
    kind: "expense",
    occurred_on: r.when_date,
    amount: r.amount,
    currency: r.currency,
    category_id: r.category_id,
    building_id: r.building_id,
    counterparty: r.counterparty,
    note: r.note,
    title: r.title,
    quantity: r.quantity,
    unit: r.unit,
    unit_price: r.unit_price,
    contract_payment_id: r.contract_payment_id,
    category: r.category_name ? { name: r.category_name, code: r.category_code } : null,
    building: r.building_name ? { name: r.building_name } : null,
  });

  const removeEvent = async (r: LedgerEvent) => {
    const table = r.kind === "expense" ? "finance_entries" : "finance_advances";
    const ok = await confirm(
      r.kind === "expense" ? t.finance.deleteConfirm : t.finance.advances.deleteConfirm,
      { danger: true }
    );
    if (!ok) return;
    const { error } = await createClient().schema("crm").from(table).delete().eq("id", r.id);
    if (error) {
      setFailure(error.message);
      return;
    }
    setFailure(null);
    bump();
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className={`${CARD} flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8`}>
          {person.balances.length === 0 ? (
            <p className="text-sm text-[var(--ink-5)]">{t.finance.advances.nothingYet}</p>
          ) : (
            person.balances.map((b) => (
              <div key={b.currency}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">
                  {t.finance.advances.balance}
                </p>
                <p className={`text-[26px] font-bold leading-tight ${toneFor(b.balance)}`}>
                  <Money value={b.balance} currency={b.currency} signed />
                </p>
                <p className="text-xs text-[var(--ink-5)]">
                  {t.finance.advances.issuedSpent
                    .replace("{issued}", `${new Intl.NumberFormat("ru-RU").format(b.issued)} ${b.currency}`)
                    .replace("{spent}", `${new Intl.NumberFormat("ru-RU").format(b.spent)} ${b.currency}`)}
                </p>
              </div>
            ))
          )}
        </div>
        {canManage && (
          <div className="flex items-start gap-2 sm:flex-col">
            <button type="button" onClick={onGive} className="btn btn-primary btn-md flex-1 sm:flex-none">
              {t.finance.advances.give}
            </button>
            <button type="button" onClick={onReturn} className="btn btn-secondary btn-md flex-1 sm:flex-none">
              {t.finance.advances.return}
            </button>
          </div>
        )}
      </div>

      {failure && (
        <p role="alert" className="rounded-lg bg-[var(--wash-rose)] px-4 py-3 text-sm text-[var(--wash-rose-ink)]">
          {failure}
        </p>
      )}

      <ul className={`${CARD} divide-y divide-[var(--border-c2)] overflow-hidden`}>
        {loading && <li className="px-5 py-8 text-center text-sm text-[var(--ink-5)]">{t.common.loading}</li>}
        {!loading && rows.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-[var(--ink-5)]">{t.finance.advances.emptyHistory}</li>
        )}
        {rows.map((r) => (
          <LedgerRow
            key={r.id}
            row={r}
            canManage={canManage}
            onEdit={() => onEditEntry(asEntry(r))}
            onDelete={() => void removeEvent(r)}
          />
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="btn btn-secondary btn-md self-center"
        >
          {loadingMore ? t.common.loading : t.finance.loadMore}
        </button>
      )}
    </section>
  );
}

function LedgerRow({
  row,
  canManage,
  onEdit,
  onDelete,
}: {
  row: LedgerEvent;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  const isExpense = row.kind === "expense";
  const category = isExpense
    ? categoryLabel(
        row.category_name ? { name: row.category_name, code: row.category_code } : null,
        t.finance.categories.contractPayments,
        t.finance.noCategory
      )
    : null;
  const primary = isExpense ? row.title || row.counterparty || category || t.finance.noCategory : row.title || t.finance.advances.give;
  const secondary = [
    isExpense ? (category && category !== primary ? category : null) : null,
    isExpense ? row.building_name : null,
    formatShortDate(row.when_date),
    !isExpense && row.note ? t.finance.advances.by.replace("{name}", row.note) : null,
  ].filter(Boolean);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          row.kind === "expense"
            ? "bg-[var(--wash-rose)] text-[var(--wash-rose-ink)]"
            : row.kind === "advance"
              ? "bg-[var(--wash-emerald)] text-[var(--wash-emerald-ink)]"
              : "bg-[var(--wash-amber)] text-[var(--wash-amber-ink)]"
        }`}
      >
        {row.kind === "expense" ? (
          <TagIcon className="h-4 w-4" />
        ) : row.kind === "advance" ? (
          <ArrowUpRightIcon className="h-4 w-4" />
        ) : (
          <ArrowDownLeftIcon className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ink-1)]">{primary}</p>
        <p className="truncate text-xs text-[var(--ink-5)]">{secondary.join(" · ")}</p>
      </div>
      <span
        className={`shrink-0 text-sm font-bold ${
          row.kind === "advance" ? "text-[var(--wash-emerald-ink)]" : row.kind === "return" ? "text-[var(--wash-amber-ink)]" : "text-[var(--ink-1)]"
        }`}
      >
        <Money value={row.kind === "advance" ? row.amount : -row.amount} currency={row.currency} signed />
      </span>
      {canManage && !row.contract_payment_id && (
        <span className="flex shrink-0 items-center gap-0.5">
          {isExpense && <IconAction label={t.finance.editEntry} icon={<PencilIcon />} size="sm" onClick={onEdit} />}
          <TrashAction label={isExpense ? t.finance.deleteEntry : t.finance.advances.delete} onClick={onDelete} />
        </span>
      )}
      {canManage && row.contract_payment_id && (
        <span
          title={t.finance.fromContractHint}
          className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-[var(--hover-c2)] px-2 text-[11px] font-semibold text-[var(--ink-4)]"
        >
          {t.finance.fromContract}
        </span>
      )}
    </li>
  );
}
