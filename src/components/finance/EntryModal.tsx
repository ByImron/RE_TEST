"use client";

import { newId } from "@/lib/newId";
import { useSingleFlight } from "@/lib/useSingleFlight";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Modal } from "@/components/Modal";
import { Toast } from "@/components/Toast";
import { ArrowDownLeftIcon, ArrowUpRightIcon, LockIcon, PlusIcon } from "@/components/icons";
import { describeFundsError } from "@/lib/finance/errors";
import { CURRENCIES, type Currency } from "@/lib/currency";
import { MIN_BUSINESS_DATE, isDateInRange, yearsAheadISO } from "@/lib/dates";
import { localISO } from "@/lib/finance/period";
import {
  MAX_CENTS,
  PRICE_SCALE,
  QTY_SCALE,
  formatCents,
  formatScaled,
  lineCents,
  parseScaled,
  scaledToPlain,
} from "@/lib/finance/money";
import { categoryLabel, type FinanceEntry, type FinanceKind } from "@/lib/finance/types";
import { useFinance } from "@/components/finance/FinanceContext";

const FIELD =
  "h-[38px] w-full rounded-lg border border-[var(--field-border)] bg-[var(--field-bg)] px-3 text-sm text-[var(--ink-1)] transition-colors";
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]";
const COMPANY = "__company";
const ZERO = BigInt(0);

type Hint = { title: string; unit: string | null; unit_price: number | null; category_id: string | null };

// One dialog for both directions. The money is a LINE -- what, how many, at
// what price -- and the total is worked out from it, exactly (see
// lib/finance/money.ts; the database repeats the arithmetic and is the one that
// counts). "Save and add another" keeps the date, kind, category and building,
// because bookkeeping is a run of similar entries.
export function EntryModal({
  entry,
  initialKind = "expense",
  onClose,
}: {
  /** Set to edit an existing row; omitted to create one. */
  entry?: FinanceEntry;
  initialKind?: FinanceKind;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const once = useSingleFlight();
  // The id this dialog will give the entry. Saving twice with it is a
  // duplicate-key error, which we treat as "already saved" -- never a second row.
  const draftId = useRef<string>(newId());
  const {
    categories,
    buildings,
    buildingId: filterBuilding,
    bump,
    createCategory,
    rememberKind,
    ownOnly,
    funds,
    spendLocked,
  } = useFinance();

  // With an empty till an expense cannot be saved, so a new dialog opens on the
  // income side -- the thing that fixes it (someone who only buys has no income
  // side; their button is locked before they get here).
  const [kind, setKind] = useState<FinanceKind>(
    entry?.kind ?? (initialKind === "expense" && spendLocked && !ownOnly ? "income" : initialKind)
  );
  const [date, setDate] = useState(entry?.occurred_on ?? localISO(new Date()));
  const [title, setTitle] = useState(entry?.title ?? "");
  const [quantity, setQuantity] = useState(entry?.quantity != null ? String(entry.quantity) : "1");
  const [unit, setUnit] = useState(entry?.unit ?? "");
  // An older entry has only a total: show it as one unit at that price.
  const [price, setPrice] = useState(
    entry ? (entry.unit_price != null ? String(entry.unit_price) : String(entry.amount)) : ""
  );
  // A new expense starts in the currency there is money in: with no somoni left
  // but some dollars, the form should not open on the one that cannot be saved.
  const [currency, setCurrency] = useState<Currency>(() => {
    if (entry) return entry.currency;
    if (!funds || initialKind !== "expense") return "TJS";
    const withMoney = CURRENCIES.find((c) => (funds[c]?.available ?? 0) > 0.004);
    return (funds.TJS?.available ?? 0) > 0.004 ? "TJS" : (withMoney ?? "TJS");
  });
  const [categoryId, setCategoryId] = useState(entry?.category_id ?? "");
  // Several buildings: the person chooses. One building: it is not a choice.
  const [buildingChoice, setBuildingChoice] = useState(
    entry
      ? (entry.building_id ?? COMPANY)
      : filterBuilding === "none"
        ? COMPANY
        : filterBuilding !== "all"
          ? filterBuilding
          : ""
  );
  const [counterparty, setCounterparty] = useState(entry?.counterparty ?? "");
  const [note, setNote] = useState(entry?.note ?? "");

  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatBusy, setNewCatBusy] = useState(false);

  const [hints, setHints] = useState<Hint[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // What was bought before, to complete the name and bring its unit, price and
  // category along. One light query of the latest lines.
  useEffect(() => {
    let cancelled = false;
    createClient()
      .schema("crm")
      .from("finance_entries")
      .select("title, unit, unit_price, category_id")
      .eq("kind", kind)
      .not("title", "is", null)
      .order("occurred_on", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (!cancelled) setHints((data ?? []) as Hint[]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const titleOptions = useMemo(() => {
    const seen = new Set<string>();
    return hints.filter((h) => {
      const k = h.title.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [hints]);

  const options = categories.filter(
    (c) => c.kind === kind && c.code !== "contract_payments" && (!c.archived || c.id === entry?.category_id)
  );

  const singleBuilding = buildings.length === 1 ? buildings[0] : null;
  const effectiveBuilding: string | null | undefined = singleBuilding
    ? singleBuilding.id
    : buildingChoice === COMPANY
      ? null
      : buildingChoice || undefined;

  const qtyScaled = parseScaled(quantity, QTY_SCALE);
  const priceScaled = parseScaled(price, PRICE_SCALE);
  const totalCents =
    qtyScaled !== null && priceScaled !== null && qtyScaled > ZERO && priceScaled > ZERO
      ? lineCents(qtyScaled, priceScaled)
      : null;

  // Can this expense be paid? Judged only for a NEW expense: an edit may be of
  // someone else's entry (the accountant correcting a buyer's), whose pot is not
  // the one shown here -- the database checks edits and answers in words.
  const fundsRow = !entry && kind === "expense" ? (funds?.[currency] ?? null) : null;
  const availableCents = fundsRow ? BigInt(Math.round(Math.max(fundsRow.available, 0) * 100)) : null;
  const noFunds = fundsRow !== null && availableCents === ZERO;
  const overdraft =
    fundsRow !== null && availableCents !== null && totalCents !== null && totalCents > availableCents;
  const blocked = noFunds || overdraft;
  const fmtAvailable = fundsRow ? `${formatCents(availableCents ?? ZERO)} ${currency}` : "";

  const switchKind = (next: FinanceKind) => {
    if (next === kind) return;
    if (next === "expense" && spendLocked && !ownOnly && !entry) return;
    setKind(next);
    // A category belongs to one direction; do not carry it across.
    setCategoryId("");
  };

  const onTitleChange = (value: string) => {
    setTitle(value);
    setError(null);
    const hit = titleOptions.find((h) => h.title.toLowerCase() === value.trim().toLowerCase());
    if (!hit) return;
    if (!price && hit.unit_price != null) setPrice(String(hit.unit_price));
    if (!unit && hit.unit) setUnit(hit.unit);
    if (!categoryId && hit.category_id && options.some((c) => c.id === hit.category_id)) {
      setCategoryId(hit.category_id);
    }
  };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const existing = categories.find(
      (c) => c.kind === kind && c.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      setCategoryId(existing.id);
      setNewCatOpen(false);
      setNewCatName("");
      return;
    }
    setNewCatBusy(true);
    const { id, error: dbError } = await createCategory(kind, name);
    setNewCatBusy(false);
    if (dbError) {
      setError(dbError);
      return;
    }
    if (id) setCategoryId(id);
    setNewCatOpen(false);
    setNewCatName("");
  };

  const save = async (addAnother: boolean) => {
    if (noFunds) return setError(ownOnly ? t.finance.funds.lockedBodyPersonal : t.finance.funds.lockedBodyCompany);
    if (overdraft) {
      return setError(
        (fundsRow?.scope === "personal" ? t.finance.funds.exceedsPersonal : t.finance.funds.exceeds).replace(
          "{sum}",
          fmtAvailable
        )
      );
    }
    if (!title.trim() && !categoryId) return setError(t.finance.form.errTitleOrCategory);
    if (buildings.length > 1 && effectiveBuilding === undefined) return setError(t.finance.form.errBuilding);
    if (qtyScaled === null || qtyScaled <= ZERO) return setError(t.finance.form.errQuantity);
    if (priceScaled === null || priceScaled <= ZERO) return setError(t.finance.form.errPrice);
    if (totalCents === null || totalCents <= ZERO || totalCents >= MAX_CENTS) {
      return setError(t.finance.form.errTooBig);
    }
    if (!isDateInRange(date, MIN_BUSINESS_DATE, yearsAheadISO(1))) return setError(t.finance.form.errDate);
    setError(null);
    setSaving(true);
    const payload = {
      ...(entry ? {} : { id: draftId.current }),
      kind,
      occurred_on: date,
      amount: Number(scaledToPlain(totalCents, 2)),
      currency,
      category_id: categoryId || null,
      building_id: effectiveBuilding ?? null,
      title: title.trim() || null,
      quantity: Number(scaledToPlain(qtyScaled, QTY_SCALE)),
      unit: unit.trim() || null,
      unit_price: Number(scaledToPlain(priceScaled, PRICE_SCALE)),
      counterparty: counterparty.trim() || null,
      note: note.trim() || null,
    };
    const table = createClient().schema("crm").from("finance_entries");
    // An update that touches no row is not an error to the database (row-level
    // security just hides the row) -- so ask for the row back. It happens when
    // the day of entry has passed while the dialog was open.
    const { data: touched, error: dbError } = entry
      ? await table.update(payload).eq("id", entry.id).select("id")
      : { data: null, error: (await table.insert(payload)).error };
    setSaving(false);
    if (entry && !dbError && (touched?.length ?? 0) === 0) {
      setError(t.finance.procurement.lockedError);
      return;
    }
    // 23505 = the entry with this dialog's id already exists: the first save went
    // through (a double click, a retry) -- that is success, not an error.
    if (dbError && (dbError as { code?: string }).code !== "23505") {
      // A refused overdraft arrives with a machine-readable reason: say it in the
      // reader's language rather than showing the database's Russian sentence.
      setError(describeFundsError(dbError as { hint?: string | null; details?: string | null }, t.finance.funds) ?? dbError.message);
      return;
    }
    bump();
    rememberKind(kind);
    if (addAnother && !entry) {
      setTitle("");
      setQuantity("1");
      setUnit("");
      setPrice("");
      setCounterparty("");
      setNote("");
      draftId.current = newId();
      setToast(t.finance.form.saved);
      return;
    }
    onClose();
  };

  const tone = kind === "income" ? "text-[var(--wash-emerald-ink)]" : "text-[var(--wash-rose-ink)]";

  return (
    <>
      <Modal
        title={
          ownOnly
            ? entry
              ? t.finance.procurement.editTitle
              : t.finance.procurement.newTitle
            : entry
              ? t.finance.editEntry
              : t.finance.newEntry
        }
        onClose={onClose}
        guardClose={!entry}
      >
        <datalist id="finance-titles">
          {titleOptions.map((h) => (
            <option key={h.title} value={h.title} />
          ))}
        </datalist>
        <datalist id="finance-units">
          {t.finance.units.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            once(() => save(false))();
          }}
          className="flex flex-col gap-4"
        >
          {/* Расход / Приход: what happens to the money, in words and an arrow.
              Someone who only buys for the company enters expenses, full stop --
              no choice to offer (the database refuses an income from them). */}
          {!ownOnly && (
          <div role="group" aria-label={t.finance.form.kind} className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map((k) => {
              const on = kind === k;
              const isIncome = k === "income";
              const closed = !isIncome && spendLocked && !entry;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => switchKind(k)}
                  aria-pressed={on}
                  aria-disabled={closed || undefined}
                  title={closed ? t.finance.funds.closedHint : undefined}
                  className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors duration-150 ${
                    closed
                      ? "cursor-not-allowed border-[var(--border-c)] bg-[var(--surface-2)] text-[var(--ink-5)]"
                      : on
                      ? isIncome
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-rose-600 bg-rose-600 text-white"
                      : "border-[var(--border-c)] bg-[var(--surface-1)] text-[var(--ink-2)] hover:border-[var(--accent-yellow)] hover:bg-[color-mix(in_srgb,var(--accent-yellow)_18%,var(--surface-1))]"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      on
                        ? "bg-white/20"
                        : isIncome
                          ? "bg-[var(--wash-emerald)] text-[var(--wash-emerald-ink)]"
                          : "bg-[var(--wash-rose)] text-[var(--wash-rose-ink)]"
                    }`}
                  >
                    {closed ? <LockIcon className="h-5 w-5" /> : isIncome ? <ArrowDownLeftIcon className="h-5 w-5" /> : <ArrowUpRightIcon className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">
                      {isIncome ? t.finance.income : t.finance.expense}
                    </span>
                    <span className={`block text-[11px] leading-tight ${on ? "text-white/80" : "text-[var(--ink-5)]"}`}>
                      {closed ? t.finance.funds.kindClosed : isIncome ? t.finance.form.kindIncomeHint : t.finance.form.kindExpenseHint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t.finance.form.date}</span>
              <input
                type="date"
                value={date}
                min={MIN_BUSINESS_DATE}
                max={yearsAheadISO(1)}
                onChange={(e) => {
                  setDate(e.target.value);
                  setError(null);
                }}
                className={FIELD}
              />
            </label>
            {singleBuilding ? (
              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>{t.finance.form.buildingFixed}</span>
                <p className="flex h-[38px] items-center truncate rounded-lg border border-[var(--border-c)] bg-[var(--surface-2)] px-3 text-sm font-medium text-[var(--ink-2)]">
                  {singleBuilding.name}
                </p>
              </div>
            ) : buildings.length > 1 ? (
              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>{t.finance.building}</span>
                <select
                  value={buildingChoice}
                  onChange={(e) => {
                    setBuildingChoice(e.target.value);
                    setError(null);
                  }}
                  className={FIELD}
                >
                  <option value="" disabled>
                    {t.finance.form.buildingPick}
                  </option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                  <option value={COMPANY}>{t.finance.companyWide}</option>
                </select>
              </label>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t.finance.form.category}</span>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setError(null);
                }}
                className={FIELD}
              >
                <option value="">{t.finance.noCategory}</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(c, t.finance.categories.contractPayments, "")}
                  </option>
                ))}
              </select>
            </label>
            {ownOnly ? null : newCatOpen ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addCategory();
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setNewCatOpen(false);
                    }
                  }}
                  placeholder={t.finance.form.newCategoryPlaceholder}
                  className={`${FIELD} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  disabled={newCatBusy || !newCatName.trim()}
                  onClick={() => once(addCategory)()}
                  className="btn btn-secondary btn-md shrink-0"
                >
                  {t.finance.form.newCategoryAdd}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNewCatOpen(true)}
                className="inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-[var(--ink-3)] transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                {t.finance.form.newCategory}
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>
              {kind === "expense" ? t.finance.form.titleExpense : t.finance.form.titleIncome}
            </span>
            <input
              autoFocus
              list="finance-titles"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={
                kind === "expense" ? t.finance.form.titlePlaceholderExpense : t.finance.form.titlePlaceholderIncome
              }
              className={FIELD}
            />
          </label>

          {/* количество × цена = итого */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[6.5rem_6rem_minmax(0,1fr)]">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t.finance.form.quantity}</span>
              <input
                inputMode="decimal"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setError(null);
                }}
                className={`${FIELD} tabular-nums`}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t.finance.form.unit}</span>
              <input
                list="finance-units"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={t.finance.form.unitPlaceholder}
                maxLength={20}
                className={FIELD}
              />
            </label>
            <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
              <span className={LABEL}>{t.finance.form.unitPrice}</span>
              <div className="flex gap-2">
                <input
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setError(null);
                  }}
                  placeholder="0"
                  className={`${FIELD} min-w-0 font-semibold tabular-nums`}
                />
                <div
                  role="group"
                  aria-label={t.finance.form.currency}
                  className="flex shrink-0 rounded-lg border border-[var(--border-strong-c)] bg-[var(--surface-1)] p-0.5"
                >
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      aria-pressed={currency === c}
                      className={`h-8 rounded-md px-2.5 text-xs font-bold transition-colors ${
                        currency === c
                          ? "bg-[#18181b] text-[var(--accent-yellow)] dark:bg-[var(--accent-yellow)] dark:text-[#18181b]"
                          : "text-[var(--ink-3)] hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            aria-live="polite"
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-c)] bg-[var(--surface-2)] px-4 py-3"
          >
            <div className="min-w-0">
              <p className={LABEL}>{t.finance.form.total}</p>
              {qtyScaled !== null && priceScaled !== null && (
                <p className="mt-0.5 truncate text-xs tabular-nums text-[var(--ink-5)]">
                  {formatScaled(qtyScaled, QTY_SCALE, { trim: true })}
                  {unit.trim() ? ` ${unit.trim()}` : ""} × {formatScaled(priceScaled, PRICE_SCALE, { trim: true })}
                </p>
              )}
            </div>
            <p className={`shrink-0 text-2xl font-bold tabular-nums ${totalCents === null ? "text-[var(--ink-5)]" : tone}`}>
              {totalCents === null ? "—" : formatCents(totalCents)}
              <span className="ml-1 text-sm font-semibold tracking-wider text-[var(--ink-4)]">{currency}</span>
            </p>
          </div>

          {fundsRow && !noFunds && (
            <p
              aria-live="polite"
              className={`-mt-1 flex items-center gap-1.5 text-xs font-medium ${
                overdraft ? "text-[var(--wash-rose-ink)]" : "text-[var(--ink-4)]"
              }`}
            >
              {(fundsRow.scope === "personal" ? t.finance.funds.availablePersonal : t.finance.funds.availableCash).replace(
                "{sum}",
                fmtAvailable
              )}
              {overdraft && (
                <span>
                  {" · "}
                  {(fundsRow.scope === "personal" ? t.finance.funds.exceedsPersonal : t.finance.funds.exceeds).replace(
                    "{sum}",
                    fmtAvailable
                  )}
                </span>
              )}
            </p>
          )}
          {noFunds && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-[var(--wash-rose-border)] bg-[var(--wash-rose)] px-4 py-3 text-[var(--wash-rose-ink)]"
            >
              <LockIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t.finance.funds.lockedTitle} ({currency})</p>
                <p className="mt-0.5 text-xs leading-snug">
                  {ownOnly ? t.finance.funds.lockedBodyPersonal : t.finance.funds.lockedBodyCompany}
                </p>
                {!ownOnly && (
                  <button
                    type="button"
                    onClick={() => setKind("income")}
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#18181b] px-2.5 py-1 text-xs font-semibold text-[var(--accent-yellow)] transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    {t.finance.funds.addIncome}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t.finance.form.counterparty}</span>
              <input
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder={t.finance.form.counterpartyPlaceholder}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t.finance.form.note}</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.finance.form.notePlaceholder}
                className={FIELD}
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-[var(--wash-rose)] px-3 py-2 text-sm text-[var(--wash-rose-ink)]">
              {error}
            </p>
          )}

          {/* On a phone the form is long: the buttons stay on screen at the bottom
              of the dialog instead of waiting below the last field. */}
          <div className="flex flex-col-reverse gap-2 pt-1 max-sm:sticky max-sm:bottom-0 max-sm:-mx-6 max-sm:-mb-6 max-sm:border-t max-sm:border-[var(--border-c)] max-sm:bg-[var(--surface-1)] max-sm:px-6 max-sm:py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-md max-sm:w-full">
              {t.common.cancel}
            </button>
            {!entry && (
              <button
                type="button"
                disabled={saving || blocked}
                onClick={() => once(() => save(true))()}
                className="btn btn-secondary btn-md max-sm:w-full"
              >
                {t.finance.form.saveAndAdd}
              </button>
            )}
            <button type="submit" disabled={saving || blocked} className="btn btn-primary btn-md max-sm:w-full">
              {t.finance.form.save}
            </button>
          </div>
        </form>
      </Modal>
      <Toast message={toast} type="success" onDismiss={() => setToast(null)} />
    </>
  );
}
