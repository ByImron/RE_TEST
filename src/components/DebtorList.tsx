"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatCurrency, type Currency } from "@/lib/currency";
import { formatShortDate } from "@/lib/formatDate";
import { waLink } from "@/lib/whatsapp";
import { reminderText } from "@/lib/debtors/reminder";
import { isWhatsAppPhone } from "@/lib/phone";
import type { ContractDebt } from "@/lib/debtors/debtors";
import { unitLabel } from "@/lib/objects/format";
import { elapsedSince, formatElapsed, type ElapsedWords } from "@/lib/debtors/elapsed";
import { IconAction } from "@/components/ActionBar";
import { WarningIcon, WhatsAppIcon } from "@/components/icons";

// The row type lives in lib/debtors/debtors.ts, with how the list is read; re-exported
// so the screens that import it from here keep working.
export type { ContractDebt };

// How long a debt has been open, in three bands the eye can sort at a glance:
// just missed (a reminder usually fixes it), a few weeks (needs a call), and
// old (needs a firm follow-up). The colour is the row's left edge AND its age
// badge, so a column of rows reads as a heat-map before any number is read.
export type Urgency = "fresh" | "mid" | "old";

function urgencyOf(daysOverdue: number): Urgency {
  if (daysOverdue <= 3) return "fresh";
  if (daysOverdue <= 30) return "mid";
  return "old";
}

const STRIPE: Record<Urgency, string> = {
  fresh: "shadow-[inset_4px_0_0_var(--wash-amber-ink)]",
  mid: "shadow-[inset_4px_0_0_var(--wash-rose-ink)]",
  old: "shadow-[inset_4px_0_0_#be123c]",
};

const BADGE: Record<Urgency, string> = {
  fresh: "bg-[var(--wash-amber)] text-[var(--wash-amber-ink)]",
  mid: "bg-[var(--wash-rose)] text-[var(--wash-rose-ink)]",
  old: "bg-[#be123c] text-white",
};

const DOT: Record<Urgency, string> = {
  fresh: "bg-[var(--wash-amber-ink)]",
  mid: "bg-[var(--wash-rose-ink)]",
  old: "bg-[#be123c]",
};

// What the three colours mean, shown once above the list.
export function DebtLegend({ t }: { t: Dictionary }) {
  const items: Array<[Urgency, string]> = [
    ["fresh", t.debtors.urgencyFresh],
    ["mid", t.debtors.urgencyMid],
    ["old", t.debtors.urgencyOld],
  ];
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-[var(--ink-4)]">
      <span className="font-semibold text-[var(--ink-3)]">{t.debtors.legendTitle}:</span>
      {items.map(([level, label]) => (
        <span key={level} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${DOT[level]}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

function AgeBadge({ debt, t }: { debt: ContractDebt; t: Dictionary }) {
  const level = urgencyOf(debt.daysOverdue);
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${BADGE[level]}`}
      >
        <span className="text-[15px] font-bold leading-none tabular-nums">{debt.daysOverdue}</span>
        {t.debtors.days}
      </span>
      <span className="text-[11px] text-[var(--ink-5)]">
        {t.debtors.since} {formatShortDate(debt.earliestDue)}
      </span>
    </div>
  );
}

function WhatsAppLink({ debt, t, block = false }: { debt: ContractDebt; t: Dictionary; block?: boolean }) {
  // The same test the "message everyone" round uses: a number that cannot open a
  // chat (a stray "12") is not offered as if it could.
  if (!isWhatsAppPhone(debt.clientPhone)) {
    return <span className="text-xs text-[var(--ink-5)]">{t.debtors.noPhone}</span>;
  }
  return (
    <a
      href={waLink(debt.clientPhone, reminderText([debt], t))}
      target="_blank"
      rel="noopener noreferrer"
      title={t.debtors.whatsapp}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--wash-emerald-border)] bg-[var(--wash-emerald)] px-3 text-xs font-semibold text-[var(--wash-emerald-ink)] transition-all hover:brightness-95 active:scale-95 ${
        block ? "flex-1" : ""
      }`}
    >
      <WhatsAppIcon className="h-3.5 w-3.5" />
      {t.debtors.whatsapp}
    </a>
  );
}

function ClientName({ debt }: { debt: ContractDebt }) {
  const cls = "font-semibold text-[var(--ink-1)]";
  return debt.clientId ? (
    <Link
      href={`/clients/${debt.clientId}`}
      className={`${cls} -mx-1 rounded px-1 transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]`}
    >
      {debt.clientName}
    </Link>
  ) : (
    <span className={cls}>{debt.clientName}</span>
  );
}

function paymentsWord(debt: ContractDebt, t: Dictionary) {
  return `${debt.missedCount} ${debt.missedCount === 1 ? t.debtors.missedOne : t.debtors.missedPayments}`;
}

// A debtor who has not paid for more than a month has missed a whole cycle;
// before that, a reminder alone usually fixes it. Drives the badge colour.
const ONE_CYCLE_DAYS = 31;

function elapsedWords(t: Dictionary): ElapsedWords {
  return { years: t.debtors.yearsShort, months: t.debtors.monthsShort, days: t.debtors.days, today: t.debtors.today };
}

// "Подъезд 2, 5 этаж, квартира 34" -- where the flat is. The number is worked out from
// the building's grid, so it is missing until the grid has been read.
function placeOf(r: ContractDebt, flatNumbers: Map<string, number>, t: Dictionary): string {
  return unitLabel(
    { name: r.objectName, block: r.objectBlock, floor: r.objectFloor },
    r.objectId ? flatNumbers.get(r.objectId) : undefined,
    t.buildings
  );
}

// Date of the last REAL payment and how long ago that was -- the whole gap, not a
// running tally of missed instalments.
function LastPaymentCell({ debt, t, inline = false }: { debt: ContractDebt; t: Dictionary; inline?: boolean }) {
  const gap = elapsedSince(debt.lastPaymentDate);
  const long = !gap || gap.totalDays > ONE_CYCLE_DAYS;
  const tone = long
    ? "bg-[var(--wash-rose)] text-[var(--wash-rose-ink)]"
    : "bg-[var(--wash-amber)] text-[var(--wash-amber-ink)]";
  const badge = gap
    ? gap.totalDays === 0
      ? t.debtors.today
      : `${formatElapsed(gap, elapsedWords(t))} ${t.debtors.ago}`
    : t.debtors.noPayments;
  return (
    <div className={inline ? "flex flex-wrap items-center gap-x-2 gap-y-1" : "flex flex-col items-start gap-1"}>
      {debt.lastPaymentDate && (
        <span className="text-[var(--ink-3)]">{formatShortDate(debt.lastPaymentDate)}</span>
      )}
      <span className={`inline-flex items-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-medium ${tone}`}>
        {badge}
      </span>
    </div>
  );
}

// Desktop: a table, one row per contract, the colour of the age on its edge.
export function DebtorTable({
  rows,
  loading,
  flatNumbers,
  t,
}: {
  rows: ContractDebt[];
  loading: boolean;
  flatNumbers: Map<string, number>;
  t: Dictionary;
}) {
  return (
    <div className="animate-fade-up hidden overflow-x-auto rounded-xl border border-[var(--border-c)] bg-[var(--surface-1)] shadow-sm sm:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--border-c)] bg-[var(--surface-2)] text-[11px] uppercase tracking-wide text-[var(--ink-4)]">
          <tr>
            <th className="py-3 pl-5 pr-4 font-semibold">{t.debtors.client}</th>
            <th className="px-4 py-3 font-semibold">{t.debtors.object}</th>
            <th className="px-4 py-3 font-semibold">{t.debtors.overdue}</th>
            <th className="px-4 py-3 font-semibold">{t.debtors.lastPayment}</th>
            <th className="px-4 py-3 text-right font-semibold">{t.debtors.overdueNow}</th>
            <th className="px-4 py-3 text-right font-semibold">{t.debtors.remainingCol}</th>
            <th className="py-3 pl-4 pr-5" />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-5)]">
                {t.common.loading}
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-[var(--wash-emerald-ink)]">
                {t.debtors.empty}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.contractId}
              className="border-b border-[var(--border-c2)] transition-colors last:border-0 hover:bg-[var(--hover-c)]"
            >
              <td className={`py-3.5 pl-5 pr-4 ${STRIPE[urgencyOf(r.daysOverdue)]}`}>
                <ClientName debt={r} />
                {r.clientPhone && (
                  <div className="text-xs tabular-nums text-[var(--ink-5)]">{r.clientPhone}</div>
                )}
              </td>
              <td className="px-4 py-3.5">
                {r.buildingName && <div className="font-medium text-[var(--ink-2)]">{r.buildingName}</div>}
                <div className="text-xs text-[var(--ink-4)]">{placeOf(r, flatNumbers, t)}</div>
                {r.contractNumber && (
                  <div className="text-xs text-[var(--ink-5)]">№{r.contractNumber}</div>
                )}
              </td>
              <td className="px-4 py-3.5">
                <AgeBadge debt={r} t={t} />
              </td>
              <td className="px-4 py-3.5">
                <LastPaymentCell debt={r} t={t} />
              </td>
              {/* Amount first, then how many payments make it up, spelled out. */}
              <td className="px-4 py-3.5 text-right">
                <div className="text-[15px] font-bold tabular-nums text-[var(--wash-rose-ink)]">
                  {formatCurrency(r.totalOverdue, r.currency)}
                </div>
                <div className="text-xs text-[var(--ink-5)]">{paymentsWord(r, t)}</div>
                {r.monthlyPayment != null && (
                  <div className="text-xs text-[var(--ink-5)]">
                    {t.debtors.monthlyPayment}: {formatCurrency(r.monthlyPayment, r.currency)}
                  </div>
                )}
              </td>
              <td className="px-4 py-3.5 text-right tabular-nums text-[var(--ink-2)]">
                {formatCurrency(r.remainingTotal, r.currency)}
              </td>
              <td className="py-3.5 pl-4 pr-5">
                <div className="flex items-center justify-end gap-1.5">
                  <WhatsAppLink debt={r} t={t} />
                  {r.clientId && (
                    <IconAction
                      label={t.debtors.openClient}
                      href={`/clients/${r.clientId}`}
                      size="sm"
                      icon={
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      }
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Phone: one card per contract, same information, the age colour on its edge.
export function DebtorCards({
  rows,
  loading,
  flatNumbers,
  t,
}: {
  rows: ContractDebt[];
  loading: boolean;
  flatNumbers: Map<string, number>;
  t: Dictionary;
}) {
  return (
    <div className="animate-fade-up flex flex-col gap-2.5 sm:hidden">
      {loading && (
        <p className="rounded-xl border border-[var(--border-c)] bg-[var(--surface-1)] px-4 py-6 text-center text-sm text-[var(--ink-5)]">
          {t.common.loading}
        </p>
      )}
      {!loading && rows.length === 0 && (
        <p className="rounded-xl border border-[var(--border-c)] bg-[var(--surface-1)] px-4 py-8 text-center text-sm text-[var(--wash-emerald-ink)]">
          {t.debtors.empty}
        </p>
      )}
      {rows.map((r) => (
        <div
          key={r.contractId}
          className={`flex flex-col gap-3 rounded-xl border border-[var(--border-c)] bg-[var(--surface-1)] p-3.5 pl-[18px] shadow-sm ${STRIPE[urgencyOf(r.daysOverdue)]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <ClientName debt={r} />
              {r.clientPhone && (
                <div className="text-xs tabular-nums text-[var(--ink-5)]">{r.clientPhone}</div>
              )}
              <div className="mt-1 text-xs text-[var(--ink-4)]">
                {[r.buildingName, placeOf(r, flatNumbers, t)].filter(Boolean).join(" · ")}
                {r.contractNumber ? ` · №${r.contractNumber}` : ""}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--ink-4)]">
                <span>{t.debtors.lastPayment}:</span>
                <LastPaymentCell debt={r} t={t} inline />
              </div>
            </div>
            <AgeBadge debt={r} t={t} />
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-[var(--border-c2)] pt-2.5">
            <div>
              <div className="text-[17px] font-bold tabular-nums text-[var(--wash-rose-ink)]">
                {formatCurrency(r.totalOverdue, r.currency)}
              </div>
              <div className="text-xs text-[var(--ink-5)]">
                {paymentsWord(r, t)} · {t.debtors.remainingCol}:{" "}
                {formatCurrency(r.remainingTotal, r.currency)}
              </div>
              {r.monthlyPayment != null && (
                <div className="text-xs text-[var(--ink-5)]">
                  {t.debtors.monthlyPayment}: {formatCurrency(r.monthlyPayment, r.currency)}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <WhatsAppLink debt={r} t={t} block />
            {r.clientId && (
              <Link
                href={`/clients/${r.clientId}`}
                className="inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-[var(--border-strong-c)] px-3 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
              >
                {t.debtors.openClient}
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// One card per currency (TJS and USD share no axis, so they never share a
// number): the headline is what is overdue right now, and the bar says how much of
// the whole outstanding balance that is. (A per-building bar chart used to sit
// underneath -- overdue drawn inside the whole balance of each ЖК -- and was read as
// noise; the list below can be filtered by ЖК instead.)
export function DebtSummary({
  currency,
  total,
  t,
}: {
  currency: Currency;
  total: { overdue: number; remaining: number; contracts: number };
  t: Dictionary;
}): ReactNode {
  const { overdue, remaining, contracts } = total;
  const share = remaining > 0 ? Math.min(100, Math.round((overdue / remaining) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border-c)] bg-[var(--surface-1)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">
            <WarningIcon className="h-3.5 w-3.5 text-[var(--wash-rose-ink)]" />
            {t.debtors.overdueNow} · {currency}
          </p>
          <p className="mt-1.5 text-[30px] font-bold leading-none tabular-nums text-[var(--wash-rose-ink)] sm:text-[34px]">
            {formatCurrency(overdue, currency)}
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-[var(--hover-c2)] px-3 py-2 text-center">
          <p className="text-2xl font-bold leading-none tabular-nums text-[var(--ink-1)]">
            {contracts}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">
            {t.debtors.debtorsCount}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--track-c)]">
          <div
            className="h-full rounded-full bg-[var(--wash-rose-ink)] transition-[width] duration-700"
            style={{ width: `${share}%` }}
          />
        </div>
        <p className="flex flex-wrap justify-between gap-x-3 text-xs text-[var(--ink-4)]">
          <span>
            <b className="font-semibold text-[var(--wash-rose-ink)]">{share}%</b> {t.debtors.shareOfBalance}
          </span>
          <span>
            {t.debtors.remainingTotal}:{" "}
            <b className="font-semibold text-[var(--ink-2)]">{formatCurrency(remaining, currency)}</b>
          </span>
        </p>
      </div>
    </div>
  );
}
