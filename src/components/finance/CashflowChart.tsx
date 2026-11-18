"use client";

import { useEffect, useId, useRef, useState } from "react";
import { compactNumber } from "@/components/charts/palette";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { monthLabel } from "@/lib/finance/period";
import type { CashflowRow } from "@/lib/finance/types";

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf.format(Math.abs(n))}`;

// Cash flow, month by month, in two stacked panels that share the same columns:
//
//  top     income grows UP from a zero line, expense grows DOWN from it, so one
//          glance says whether more came in than went out; a thin line through
//          the dots is the month's net result;
//  bottom  how much was actually in the till at the end of each month.
//
// Hovering (or tapping) a column lights it up and spells the month out under the
// chart. The till panel is company-wide, so the parent hides it when the view is
// narrowed to one building.
export function CashflowChart({
  data,
  currency,
  showBalance,
}: {
  data: Array<Omit<CashflowRow, "currency">>;
  currency: string;
  showBalance: boolean;
}) {
  const { locale, t } = useLocale();
  const uid = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  // null until the box has been measured: the picture is not drawn at a guessed
  // width first. (A fixed-width SVG in the tree lends its width to every ancestor's
  // intrinsic size -- on a phone that stretched the whole page sideways.)
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? 640;
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setMeasured(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = data.length;
  const narrow = width < 520;
  const padL = narrow ? 38 : 46;
  const padR = 10;
  const top = 12;
  const hA = narrow ? 150 : 190;
  const labelsY = top + hA + 16;
  const topB = labelsY + 22;
  const hB = showBalance ? (narrow ? 58 : 70) : 0;
  const height = showBalance ? topB + hB + 14 : labelsY + 8;
  const innerW = width - padL - padR;
  const band = n > 0 ? innerW / n : innerW;
  const bw = Math.min(Math.max(band * 0.56, 6), 30);
  const cx = (i: number) => padL + band * (i + 0.5);

  // One scale for both directions, with the zero line placed where it leaves
  // each side exactly the room its biggest bar needs.
  const maxI = Math.max(...data.map((d) => d.income), 0);
  const maxE = Math.max(...data.map((d) => d.expense), 0);
  const span = maxI + maxE || 1;
  const unit = hA / span;
  const zeroY = top + maxI * unit;

  // A scale label is dropped when it would land on the "0" label (one side is
  // tiny next to the other) instead of printing two numbers over each other.
  const showTopLabel = maxI > 0 && zeroY - top >= 14;
  const showBottomLabel = maxE > 0 && top + hA - zeroY >= 14;

  const net = data.map((d) => d.income - d.expense);
  const netPoints = data.map((d, i) => `${cx(i)},${zeroY - net[i] * unit}`).join(" ");

  const cash = data.map((d) => d.cash_end);
  const minC = Math.min(...cash, 0);
  const maxC = Math.max(...cash, 0);
  const rangeC = maxC - minC || 1;
  const yC = (v: number) => topB + ((maxC - v) / rangeC) * hB;
  const linePts = cash.map((v, i) => `${cx(i)},${yC(v)}`);
  const baseC = yC(Math.max(minC, 0) === 0 && minC >= 0 ? 0 : minC);
  const areaPath =
    n > 0
      ? `M${cx(0)},${baseC} L${linePts.join(" L")} L${cx(n - 1)},${baseC} Z`
      : "";

  // A month label is about 50px wide: print every one only when each column is that wide.
  const every = band >= 54 ? 1 : 2;
  const shown = active !== null ? data[active] : null;
  const pick = (i: number) => setActive((cur) => (cur === i ? null : i));

  return (
    // "relative": the screen-reader copy of the data below is absolutely positioned. Without
    // a positioned ancestor it is placed against the PAGE, at the depth it sits inside the
    // scrolling <main>, and stretches the document -- the whole window then scrolls and the
    // app slides up over blank space. Here it stays inside its card.
    <div className="relative flex min-w-0 flex-col gap-2.5">
      <div ref={box} className="w-full min-w-0" style={{ minHeight: measured === null ? height : undefined }}>
        {measured !== null && (
        <svg
          role="img"
          aria-label={`${t.finance.cashflow.title}, ${currency}`}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "auto" }}
          className="block max-w-full select-none"
          onMouseLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id={`${uid}-in`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#34d399" />
              <stop offset="1" stopColor="#059669" />
            </linearGradient>
            <linearGradient id={`${uid}-out`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#e11d48" />
              <stop offset="1" stopColor="#fb7185" />
            </linearGradient>
            <linearGradient id={`${uid}-cash`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#facc15" stopOpacity="0.55" />
              <stop offset="1" stopColor="#facc15" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* the active column's soft backdrop */}
          {active !== null && (
            <rect
              x={cx(active) - band / 2 + 1}
              y={top - 6}
              width={band - 2}
              height={(showBalance ? topB + hB : labelsY) - top + 10}
              rx={8}
              className="fill-[var(--hover-c2)]"
            />
          )}

          {/* axis: top = biggest income, bottom = biggest expense, zero in between */}
          <line x1={padL} x2={width - padR} y1={zeroY} y2={zeroY} stroke="var(--chart-axis)" strokeWidth={1} opacity={0.55} />
          {maxI > 0 && <line x1={padL} x2={width - padR} y1={top} y2={top} stroke="var(--chart-grid)" strokeDasharray="3 4" />}
          {maxE > 0 && (
            <line x1={padL} x2={width - padR} y1={top + hA} y2={top + hA} stroke="var(--chart-grid)" strokeDasharray="3 4" />
          )}
          {showTopLabel && (
            <text x={padL - 6} y={top + 4} textAnchor="end" fontSize={10} className="fill-[var(--chart-axis)] tabular-nums">
              {compactNumber(maxI)}
            </text>
          )}
          <text x={padL - 6} y={zeroY + 3.5} textAnchor="end" fontSize={10} className="fill-[var(--chart-axis)] tabular-nums">
            0
          </text>
          {showBottomLabel && (
            <text x={padL - 6} y={top + hA + 3} textAnchor="end" fontSize={10} className="fill-[var(--chart-axis)] tabular-nums">
              −{compactNumber(maxE)}
            </text>
          )}

          {data.map((d, i) => {
            const on = active === null || active === i;
            const hi = d.income * unit;
            const he = d.expense * unit;
            return (
              <g key={d.month} opacity={on ? 1 : 0.38} className="transition-opacity duration-150">
                {d.income > 0 && (
                  <rect
                    x={cx(i) - bw / 2}
                    y={zeroY - Math.max(hi, 2)}
                    width={bw}
                    height={Math.max(hi, 2)}
                    rx={Math.min(4, bw / 2)}
                    fill={`url(#${uid}-in)`}
                    className="animate-chart-grow"
                    style={{ transformBox: "fill-box", transformOrigin: "bottom", animationDelay: `${i * 35}ms` }}
                  />
                )}
                {d.expense > 0 && (
                  <rect
                    x={cx(i) - bw / 2}
                    y={zeroY}
                    width={bw}
                    height={Math.max(he, 2)}
                    rx={Math.min(4, bw / 2)}
                    fill={`url(#${uid}-out)`}
                    className="animate-chart-grow"
                    style={{ transformBox: "fill-box", transformOrigin: "top", animationDelay: `${i * 35}ms` }}
                  />
                )}
              </g>
            );
          })}

          {/* the net result of each month */}
          {n > 1 && (
            <polyline
              points={netPoints}
              fill="none"
              stroke="var(--ink-2)"
              strokeWidth={1.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.75}
            />
          )}
          {data.map((d, i) => (
            <circle
              key={`net${d.month}`}
              cx={cx(i)}
              cy={zeroY - net[i] * unit}
              r={active === i ? 4.6 : 3.2}
              fill="var(--accent-yellow)"
              stroke="var(--ink-1)"
              strokeWidth={1.3}
              className="transition-[r] duration-150"
            />
          ))}

          {data.map((d, i) =>
            i % every === (n - 1) % every ? (
              <text
                key={`m${d.month}`}
                x={cx(i)}
                y={labelsY}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={active === i ? 700 : 400}
                className={active === i ? "fill-[var(--ink-1)]" : "fill-[var(--ink-4)]"}
              >
                {monthLabel(d.month, locale)}
              </text>
            ) : null
          )}

          {showBalance && n > 0 && (
            <g>
              <text x={padL} y={topB - 6} fontSize={10} fontWeight={700} letterSpacing="0.06em" className="fill-[var(--ink-5)] uppercase">
                {t.finance.cashflow.balanceLine}
              </text>
              {minC < 0 && (
                <line x1={padL} x2={width - padR} y1={yC(0)} y2={yC(0)} stroke="var(--chart-axis)" strokeDasharray="3 4" opacity={0.6} />
              )}
              <path d={areaPath} fill={`url(#${uid}-cash)`} className="animate-chart-fade" />
              <polyline
                points={linePts.join(" ")}
                fill="none"
                stroke="#d97706"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {cash.map((v, i) => (
                <circle
                  key={`c${data[i].month}`}
                  cx={cx(i)}
                  cy={yC(v)}
                  r={active === i ? 4.4 : i === n - 1 ? 3.6 : 2.4}
                  fill={v < 0 ? "#e11d48" : "#facc15"}
                  stroke="#d97706"
                  strokeWidth={1.2}
                />
              ))}
              <text
                x={Math.min(cx(n - 1) + 2, width - padR)}
                y={Math.max(yC(cash[n - 1]) - 8, topB - 1)}
                textAnchor="end"
                fontSize={11}
                fontWeight={700}
                className={cash[n - 1] < 0 ? "fill-[var(--wash-rose-ink)]" : "fill-[var(--ink-1)]"}
              >
                {compactNumber(cash[n - 1])} {currency}
              </text>
            </g>
          )}

          {/* hover / tap targets, one per column */}
          {data.map((d, i) => (
            <rect
              key={`hit${d.month}`}
              x={cx(i) - band / 2}
              y={0}
              width={band}
              height={height}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => pick(i)}
            />
          ))}
        </svg>
        )}
      </div>

      <div aria-live="polite" className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ink-3)]">
        {shown ? (
          <>
            <span className="font-semibold text-[var(--ink-1)]">{monthLabel(shown.month, locale)}</span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-emerald-500" />
              {t.finance.income}: <b className="font-semibold tabular-nums text-[var(--ink-1)]">{nf.format(shown.income)}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-rose-500" />
              {t.finance.expense}: <b className="font-semibold tabular-nums text-[var(--ink-1)]">{nf.format(shown.expense)}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full border border-[var(--ink-1)] bg-[var(--accent-yellow)]" />
              {t.finance.cashflow.net}:{" "}
              <b
                className={`font-semibold tabular-nums ${
                  shown.income - shown.expense < 0 ? "text-[var(--wash-rose-ink)]" : "text-[var(--wash-emerald-ink)]"
                }`}
              >
                {signed(shown.income - shown.expense)}
              </b>
            </span>
            {Math.abs(shown.advances) > 0.004 && (
              <span>
                {t.finance.cashflow.advances}: <b className="font-semibold tabular-nums text-[var(--ink-1)]">{signed(shown.advances)}</b>
              </span>
            )}
            {showBalance && (
              <span>
                {t.finance.cashflow.cashEnd}:{" "}
                <b className={`font-semibold tabular-nums ${shown.cash_end < 0 ? "text-[var(--wash-rose-ink)]" : "text-[var(--ink-1)]"}`}>
                  {nf.format(shown.cash_end)} {currency}
                </b>
              </span>
            )}
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
            <span className="flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full border border-[var(--ink-1)] bg-[var(--accent-yellow)]" />
              {t.finance.cashflow.net}
            </span>
            {showBalance && (
              <span className="flex items-center gap-1.5">
                <i className="h-0.5 w-3 rounded bg-amber-600" />
                {t.finance.cashflow.balanceLine}
              </span>
            )}
          </>
        )}
      </div>

      {/* For screen readers. The clipping lives on a div: a <table> keeps its content
          width whatever sr-only says, and this one -- absolutely positioned -- pushed the
          whole phone page 200px sideways. */}
      <div className="sr-only">
      <table>
        <caption>{t.finance.cashflow.title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th>{monthLabel(d.month, locale)}</th>
              <td>{t.finance.income}: {d.income}</td>
              <td>{t.finance.expense}: {d.expense}</td>
              <td>{t.finance.cashflow.cashEnd}: {d.cash_end}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
