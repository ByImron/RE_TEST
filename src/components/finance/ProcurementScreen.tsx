"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useConfirm } from "@/components/ConfirmDialog";
import { useSingleFlight } from "@/lib/useSingleFlight";
import { LockIcon, PencilIcon, PlusIcon, TagIcon, TrashIcon } from "@/components/icons";
import { formatShortDate } from "@/lib/formatDate";
import { categoryLabel, type FinanceEntry, type PersonBalance } from "@/lib/finance/types";
import { useFinance } from "@/components/finance/FinanceContext";
import { EntryModal } from "@/components/finance/EntryModal";
import { Money } from "@/components/finance/FinanceParts";

const PAGE = 60;

const COLUMNS =
  "id, kind, occurred_on, amount, currency, category_id, building_id, counterparty, note, title, quantity, unit, unit_price, contract_payment_id, entered_on, category:finance_categories(name, code)";

type Row = Omit<FinanceEntry, "building"> & { entered_on: string | null };

// The whole app for someone who buys for the company and answers for the cash
// they were given: what is left in their hands, what they spent, and one big
// button to record the next purchase. Nothing else -- no income, no company
// totals, no colleagues; the database would not show them anyway (RLS), this
// just does not offer it.
//
// Built for a phone in one hand: big targets, one column, the "+" under the
// thumb. A row of today can be corrected or removed; from tomorrow it is
// locked (the database enforces that too) and only the accountant changes it.
export function ProcurementHome() {
  const { t } = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const once = useSingleFlight();
  const { buildings, version, bump, editor, openEntry, editEntry, closeEditor, setupMissing } =
    useFinance();

  const [rows, setRows] = useState<Row[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  const [balances, setBalances] = useState<PersonBalance[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (setupMissing) return;
    let cancelled = false;
    const db = createClient().schema("crm");
    void Promise.all([
      db
        .from("finance_entries")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .limit(limit + 1),
      db.rpc("finance_today"),
      db.rpc("finance_my_balance"),
    ]).then(([list, day, balance]) => {
      if (cancelled) return;
      if (list.error) {
        setFailure(list.error.message);
      } else {
        const batch = (list.data ?? []) as unknown as Row[];
        setFailure(null);
        setRows(batch.slice(0, limit));
        setHasMore(batch.length > limit);
      }
      if (!day.error && typeof day.data === "string") setToday(day.data);
      if (!balance.error) setBalances((balance.data ?? []) as PersonBalance[]);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [version, limit, setupMissing]);

  const buildingName = useMemo(() => new Map(buildings.map((b) => [b.id, b.name])), [buildings]);
  const editableRow = (r: Row) => today !== null && r.entered_on === today && !r.contract_payment_id;
  const todays = rows.filter(editableRow);
  const earlier = rows.filter((r) => !editableRow(r));

  const asEntry = (r: Row): FinanceEntry => ({
    ...r,
    building: r.building_id && buildingName.get(r.building_id) ? { name: buildingName.get(r.building_id)! } : null,
  });

  const remove = async (r: Row) => {
    const ok = await confirm(t.finance.deleteConfirm, { danger: true });
    if (!ok) return;
    const { data, error } = await createClient()
      .schema("crm")
      .from("finance_entries")
      .delete()
      .eq("id", r.id)
      .select("id");
    if (error) {
      setFailure(error.message);
      return;
    }
    // Nothing deleted and no error: the day of entry has passed (the database
    // hides the row from the delete) -- say why, and refresh the list.
    if ((data?.length ?? 0) === 0) setFailure(t.finance.procurement.lockedError);
    else setFailure(null);
    bump();
  };

  const logout = useCallback(async () => {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  // No balance row yet (nothing issued, nothing spent): show a calm zero.
  const cards: PersonBalance[] =
    balances && balances.length > 0 ? balances : [{ currency: "TJS", issued: 0, spent: 0, balance: 0 }];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-28">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[var(--ink-1)]">{t.finance.procurement.title}</h1>
        <button
          type="button"
          onClick={() => void logout()}
          className="btn btn-ghost btn-md"
        >
          {t.login.logout}
        </button>
      </div>

      <section aria-label={t.finance.procurement.balance} className="flex flex-col gap-2.5">
        {cards.map((b) => {
          const over = b.balance < 0;
          return (
            <div key={b.currency} className="rounded-2xl bg-[#18181b] p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                {t.finance.procurement.balance}
              </p>
              <p
                className={`mt-1.5 text-[34px] font-bold leading-none ${
                  over ? "text-rose-300" : "text-[var(--accent-yellow)]"
                }`}
              >
                <Money value={b.balance} currency={b.currency} signed={over} />
              </p>
              <p className="mt-2.5 text-xs text-white/60">
                {t.finance.procurement.issuedSpent
                  .replace("{issued}", `${new Intl.NumberFormat("ru-RU").format(b.issued)} ${b.currency}`)
                  .replace("{spent}", `${new Intl.NumberFormat("ru-RU").format(b.spent)} ${b.currency}`)}
              </p>
              {over && <p className="mt-1.5 text-xs text-rose-300">{t.finance.procurement.overspent}</p>}
            </div>
          );
        })}
      </section>

      {failure && (
        <p role="alert" className="rounded-lg bg-[var(--wash-rose)] px-4 py-3 text-sm text-[var(--wash-rose-ink)]">
          {failure}
        </p>
      )}

      {loaded && rows.length === 0 && !failure && (
        <p className="rounded-2xl border border-dashed border-[var(--border-c)] px-5 py-8 text-center text-sm text-[var(--ink-4)]">
          {t.finance.procurement.empty}
        </p>
      )}

      {todays.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-[var(--ink-2)]">{t.finance.procurement.today}</h2>
          {todays.map((r) => (
            <ExpenseRow
              key={r.id}
              row={r}
              editable
              building={r.building_id ? buildingName.get(r.building_id) ?? null : null}
              onEdit={() => editEntry(asEntry(r))}
              onDelete={() => void remove(r)}
            />
          ))}
        </section>
      )}

      {earlier.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-[var(--ink-2)]">{t.finance.procurement.earlier}</h2>
          <p className="px-1 text-xs text-[var(--ink-5)]">{t.finance.procurement.lockedHint}</p>
          {earlier.map((r) => (
            <ExpenseRow
              key={r.id}
              row={r}
              editable={false}
              building={r.building_id ? buildingName.get(r.building_id) ?? null : null}
            />
          ))}
        </section>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={once(async () => setLimit((n) => n + PAGE))}
          className="btn btn-secondary btn-md w-full"
        >
          {t.finance.loadMore}
        </button>
      )}

      {/* The one action of this screen: under the thumb, clear of the home
          indicator, never covered by the list. */}
      <button
        type="button"
        onClick={() => openEntry("expense")}
        aria-label={t.finance.procurement.add}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-16 w-16 touch-manipulation items-center justify-center rounded-full bg-[var(--accent-yellow)] text-[#18181b] shadow-lg ring-1 ring-black/10 transition-transform duration-150 active:scale-95"
      >
        <PlusIcon className="h-7 w-7" />
      </button>

      {editor && <EntryModal entry={editor.entry} initialKind="expense" onClose={closeEditor} />}
    </div>
  );
}

function ExpenseRow({
  row,
  editable,
  building,
  onEdit,
  onDelete,
}: {
  row: Row;
  editable: boolean;
  building: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useLocale();
  const category = row.category
    ? categoryLabel(row.category, t.finance.categories.contractPayments, "")
    : null;
  const primary = row.title || category || row.counterparty || t.finance.noCategory;
  const secondary = [category && category !== primary ? category : null, building, formatShortDate(row.occurred_on)]
    .filter(Boolean)
    .join(" · ");

  const body = (
    <>
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent-yellow)_18%,transparent)] text-[var(--ink-2)]"
      >
        <TagIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="line-clamp-2 break-words text-[15px] font-medium leading-snug text-[var(--ink-1)]">{primary}</span>
        <span className="block truncate text-xs text-[var(--ink-4)]">{secondary}</span>
      </span>
      <span className="shrink-0 text-[15px] font-bold text-[var(--ink-1)]">
        <Money value={row.amount} currency={row.currency} />
      </span>
    </>
  );

  if (!editable) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-c)] bg-[var(--surface-1)] p-3 opacity-70">
        {body}
        <LockIcon className="h-4 w-4 shrink-0 text-[var(--ink-5)]" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-[var(--border-c)] bg-[var(--surface-1)] pr-1.5">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${t.finance.editEntry}: ${primary}`}
        className="flex min-w-0 flex-1 touch-manipulation items-center gap-3 rounded-2xl p-3 text-left transition-colors active:bg-[var(--hover-c)]"
      >
        {body}
        <PencilIcon className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${t.finance.deleteEntry}: ${primary}`}
        className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-[var(--ink-4)] transition-colors active:bg-[var(--hover-c)]"
      >
        <TrashIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
