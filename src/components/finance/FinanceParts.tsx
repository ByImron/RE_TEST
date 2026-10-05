"use client";

import { useState } from "react";
import { compactNumber } from "@/components/charts/palette";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { monthLabel } from "@/lib/finance/period";

const nf = new Intl.NumberFormat("ru-RU");

// An amount with its currency set small beside it, the way the dashboard shows
// money: the figure leads, the code is a quiet suffix.
export function Money({
  value,
  currency,
  signed = false,
  className = "",
}: {
  value: number;
  currency: string;
  /** Prefix a + or a real minus sign. */
  signed?: boolean;
  className?: string;
}) {
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : "";
  return (
    <span className={`tabular-nums ${className}`}>
      {sign}
      {nf.format(signed ? Math.abs(value) : value)}
      <span className="ml-1 text-[0.62em] font-semibold tracking-wider text-[var(--ink-4)]">
        {currency}
      </span>
    </span>
  );
}

export const toneFor = (value: number) =>
  value > 0
    ? "text-[var(--wash-emerald-ink)]"
    : value < 0
      ? "text-[var(--wash-rose-ink)]"
      : "text-[var(--ink-3)]";

// Income and expense, side by side, month after month, on one scale.
//
// Two bars per month rather than a line: the question is "did more come in
// than went out THIS month", and two adjacent lengths answer it at a glance.
// Hovering (or tapping) a month shows the exact figures under the chart.
export function MonthBars({
  data,
  currency,
}: {
  data: Array<{ month: string; income: number; expense: number }>;
  currency: string;
}) {
  const { locale, t } = useLocale();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
  const shown = active !== null ? data[active] : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex h-40 items-end gap-2 overflow-x-auto pb-1" onMouseLeave={() => setActive(null)}>
        {data.map((d, i) => (
          <button
            key={d.month}
            type="button"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-label={`${monthLabel(d.month, locale)}: ${t.finance.income} ${nf.format(d.income)}, ${t.finance.expense} ${nf.format(d.expense)} ${currency}`}
            className={`flex h-full min-w-8 flex-1 flex-col justify-end gap-1 rounded-md px-0.5 transition-opacity ${
              active !== null && active !== i ? "opacity-40" : ""
            }`}
          >
            <div className="flex flex-1 items-end justify-center gap-0.5">
              <span
                className="animate-chart-grow w-full max-w-4 rounded-t-sm bg-emerald-500"
                style={{ height: `${(d.income / max) * 100}%`, minHeight: d.income > 0 ? 3 : 0 }}
              />
              <span
                className="animate-chart-grow w-full max-w-4 rounded-t-sm bg-rose-500"
                style={{ height: `${(d.expense / max) * 100}%`, minHeight: d.expense > 0 ? 3 : 0 }}
              />
            </div>
            <span className="whitespace-nowrap text-center text-[11px] leading-none text-[var(--ink-4)]">
              {monthLabel(d.month, locale)}
            </span>
          </button>
        ))}
      </div>
      <div className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ink-3)]">
        {shown ? (
          <>
            <span className="font-semibold text-[var(--ink-1)]">{monthLabel(shown.month, locale)}</span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-emerald-500" />
              {compactNumber(shown.income)} {currency}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-rose-500" />
              {compactNumber(shown.expense)} {currency}
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-emerald-500" />
              {t.finance.income}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-rose-500" />
              {t.finance.expense}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
