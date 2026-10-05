"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { newId } from "@/lib/newId";
import { useSingleFlight } from "@/lib/useSingleFlight";
import { Modal } from "@/components/Modal";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "@/components/icons";
import { CURRENCIES, type Currency } from "@/lib/currency";
import { MIN_BUSINESS_DATE, isDateInRange, yearsAheadISO } from "@/lib/dates";
import { localISO } from "@/lib/finance/period";
import { MAX_CENTS, parseScaled, scaledToPlain } from "@/lib/finance/money";
import type { AdvancePerson } from "@/lib/finance/types";

const FIELD =
  "h-[42px] w-full rounded-lg border border-[var(--field-border)] bg-[var(--field-bg)] px-3 text-sm text-[var(--ink-1)] transition-colors";
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]";
const ZERO = BigInt(0);

// Cash goes to a person "under report", or comes back from them. It is not an
// income or an expense -- the money has not been spent yet -- so it lives in its
// own journal and only moves the company's cash balance (see crm.finance_cash).
// A return is stored as a negative issue.
export function AdvanceModal({
  people,
  initialPersonId,
  initialMode = "give",
  onClose,
  onSaved,
}: {
  people: AdvancePerson[];
  initialPersonId?: string;
  initialMode?: "give" | "return";
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const once = useSingleFlight();
  // Saving twice with the same id is a duplicate-key error, read as "already saved".
  const draftId = useRef<string>(newId());

  const [mode, setMode] = useState<"give" | "return">(initialMode);
  const [personId, setPersonId] = useState(initialPersonId ?? (people.length === 1 ? people[0].id : ""));
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("TJS");
  const [date, setDate] = useState(localISO(new Date()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseScaled(amount, 2);

  const save = async () => {
    if (!personId) return setError(t.finance.advances.errPerson);
    if (cents === null || cents <= ZERO || cents >= MAX_CENTS) return setError(t.finance.advances.errAmount);
    if (!isDateInRange(date, MIN_BUSINESS_DATE, yearsAheadISO(1))) return setError(t.finance.form.errDate);
    setError(null);
    setSaving(true);
    const value = Number(scaledToPlain(cents, 2));
    const { error: dbError } = await createClient()
      .schema("crm")
      .from("finance_advances")
      .insert({
        id: draftId.current,
        person_id: personId,
        amount: mode === "give" ? value : -value,
        currency,
        given_on: date,
        note: note.trim() || null,
      });
    setSaving(false);
    if (dbError && (dbError as { code?: string }).code !== "23505") {
      setError(dbError.message);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Modal
      title={mode === "give" ? t.finance.advances.giveTitle : t.finance.advances.returnTitle}
      onClose={onClose}
      guardClose
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          once(save)();
        }}
        className="flex flex-col gap-4"
      >
        <div role="group" aria-label={t.finance.advances.kind} className="grid grid-cols-2 gap-2">
          {(["give", "return"] as const).map((m) => {
            const on = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={on}
                className={`flex touch-manipulation items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                  on
                    ? "border-[#18181b] bg-[#18181b] text-[var(--accent-yellow)] dark:border-[var(--accent-yellow)] dark:bg-[var(--accent-yellow)] dark:text-[#18181b]"
                    : "border-[var(--border-c)] bg-[var(--surface-1)] text-[var(--ink-2)] hover:border-[var(--accent-yellow)]"
                }`}
              >
                {m === "give" ? <ArrowUpRightIcon className="h-5 w-5" /> : <ArrowDownLeftIcon className="h-5 w-5" />}
                {m === "give" ? t.finance.advances.give : t.finance.advances.return}
              </button>
            );
          })}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t.finance.advances.person}</span>
          <select
            value={personId}
            onChange={(e) => {
              setPersonId(e.target.value);
              setError(null);
            }}
            className={FIELD}
          >
            <option value="" disabled>
              {t.finance.advances.personPick}
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.email}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>{t.finance.advances.amount}</span>
            <input
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              placeholder="0"
              className={`${FIELD} text-lg font-semibold tabular-nums`}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>{t.finance.form.currency}</span>
            <div
              role="group"
              aria-label={t.finance.form.currency}
              className="flex h-[42px] rounded-lg border border-[var(--border-strong-c)] bg-[var(--surface-1)] p-0.5"
            >
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  aria-pressed={currency === c}
                  className={`touch-manipulation rounded-md px-3 text-xs font-bold transition-colors ${
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

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn btn-ghost btn-md max-sm:w-full">
            {t.common.cancel}
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary btn-md max-sm:w-full">
            {mode === "give" ? t.finance.advances.saveGive : t.finance.advances.saveReturn}
          </button>
        </div>
      </form>
    </Modal>
  );
}
