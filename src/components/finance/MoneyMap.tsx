"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { compactNumber } from "@/components/charts/palette";
import type { MapNode } from "@/lib/finance/moneyMap";

// A Sankey diagram of the money of a period: sources on the left flow into one
// pool in the middle and out to the uses on the right; the thickness of a
// ribbon is the sum. Plain SVG, no library, redrawn to the width it is given --
// on a phone the label gutters narrow and the names are shortened, the picture
// keeps its shape.
//
// Hover (or tap) a node and its own ribbons light up while the rest fade; the
// line under the picture then says exactly what that node is and how big.

const INCOME_COLORS = ["#16a34a", "#0d9488", "#0891b2", "#2563eb", "#65a30d", "#7c3aed"];
const EXPENSE_COLORS = ["#e11d48", "#f97316", "#d97706", "#db2777", "#9333ea", "#4f46e5", "#dc2626", "#ea580c"];
const FILLER = { leftover: "#0ea5e9", reserve: "#94a3b8", other: "#94a3b8" } as const;
const POOL = "#facc15";

type Placed = { node: MapNode; color: string; y: number; h: number; cy: number; ch: number };

function colorOf(node: MapNode, i: number): string {
  if (node.kind === "leftover" || node.kind === "reserve" || node.kind === "other") return FILLER[node.kind];
  return node.kind === "income" ? INCOME_COLORS[i % INCOME_COLORS.length] : EXPENSE_COLORS[i % EXPENSE_COLORS.length];
}

// Stacks one column top to bottom. Heights follow the values, but never thinner
// than `minH` (a tiny category must stay visible and tappable) -- and when that
// would overflow the column, everything is scaled back to fit. Each node also
// gets its slice of the central pool (cy/ch), proportional to its own height,
// so the ribbons meet the pool edge to edge.
function stack(nodes: MapNode[], total: number, top: number, room: number, gap: number, minH: number): Placed[] {
  const n = nodes.length;
  if (n === 0) return [];
  const usable = Math.max(room - gap * (n - 1), n * minH);
  let hs = nodes.map((nd) => Math.max((nd.value / total) * usable, minH));
  const sum = hs.reduce((a, b) => a + b, 0);
  if (sum > usable) hs = hs.map((h) => (h * usable) / sum);
  const sumH = hs.reduce((a, b) => a + b, 0);
  const out: Placed[] = [];
  let y = top;
  let cy = top;
  nodes.forEach((node, i) => {
    const ch = (hs[i] / sumH) * room;
    out.push({ node, color: colorOf(node, i), y, h: hs[i], cy, ch });
    y += hs[i] + gap;
    cy += ch;
  });
  return out;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, Math.max(max - 1, 1))}…` : text);

// "Name · amount" on one line, cut to fit: the NAME is what gives way (the amount is
// the point of the label, and a label longer than its gutter runs off the picture).
const oneLine = (name: string, amount: string, max: number) =>
  `${clip(name, Math.max(max - amount.length - 3, 5))} · ${amount}`;

export function MoneyMap({
  sources,
  uses,
  total,
  currency,
  totalLabel,
  ariaLabel,
  moneyIn,
  moneyOut,
}: {
  sources: MapNode[];
  uses: MapNode[];
  total: number;
  currency: string;
  /** "Всего: {sum}" already filled in. */
  totalLabel: string;
  ariaLabel: string;
  moneyIn: string;
  moneyOut: string;
}) {
  const uid = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  // null until measured -- see CashflowChart: no picture at a guessed width.
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? 640;
  const [active, setActive] = useState<{ side: "l" | "r"; i: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setMeasured(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = width < 520;
  const rows = Math.max(sources.length, uses.length);
  const height = Math.min(440, Math.max(240, rows * 44 + 36));
  const pad = 18;
  const room = height - pad * 2;
  const labelW = narrow ? Math.min(Math.max(Math.round(width * 0.28), 88), 112) : Math.min(200, Math.round(width * 0.25));
  const nodeW = 10;
  const poolW = 12;
  const leftX = labelW;
  const rightX = width - labelW - nodeW;
  const poolX = (leftX + nodeW + rightX) / 2 - poolW / 2;

  const left = useMemo(() => stack(sources, total, pad, room, 8, 12), [sources, total, room]);
  const right = useMemo(() => stack(uses, total, pad, room, 8, 12), [uses, total, room]);

  // How many characters fit the gutter. Deliberately pessimistic (Cyrillic runs wide, bold
  // wider still): a label that overflows runs off the edge of the picture and is cut.
  const charsBold = Math.max(Math.floor((labelW - 12) / (narrow ? 6.7 : 6.5)), 6);
  const charsPlain = Math.max(Math.floor((labelW - 12) / (narrow ? 6.1 : 6.0)), 6);
  const share = (v: number) => {
    const p = (v / total) * 100;
    return p < 1 ? "<1%" : `${Math.round(p)}%`;
  };

  const pick = (side: "l" | "r", i: number) => setActive((cur) => (cur && cur.side === side && cur.i === i ? null : { side, i }));
  const activeNode = active ? (active.side === "l" ? left[active.i] : right[active.i])?.node : null;
  const lit = (side: "l" | "r", i: number) => !active || (active.side === side && active.i === i);

  const ribbon = (x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) => {
    const mx = (x0 + x1) / 2;
    return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + h1} C${mx},${y1 + h1} ${mx},${y0 + h0} ${x0},${y0 + h0} Z`;
  };

  const label = (p: Placed, side: "l" | "r", i: number) => {
    const isLeft = side === "l";
    const x = isLeft ? leftX - 7 : rightX + nodeW + 7;
    const anchor = isLeft ? "end" : "start";
    const two = p.h >= 28;
    const main = clip(p.node.label, charsBold);
    const sub = `${compactNumber(p.node.value)} · ${share(p.node.value)}`;
    return (
      <g key={`${side}${i}`} opacity={lit(side, i) ? 1 : 0.45} className="transition-opacity">
        {two ? (
          <>
            <text x={x} y={p.y + p.h / 2 - 2} textAnchor={anchor} fontSize={11.5} fontWeight={600} className="fill-[var(--ink-1)]">
              {main}
            </text>
            <text x={x} y={p.y + p.h / 2 + 12} textAnchor={anchor} fontSize={10.5} className="fill-[var(--ink-4)]">
              {sub}
            </text>
          </>
        ) : (
          <text x={x} y={p.y + p.h / 2 + 4} textAnchor={anchor} fontSize={11} className="fill-[var(--ink-2)]">
            {oneLine(p.node.label, compactNumber(p.node.value), charsPlain)}
          </text>
        )}
      </g>
    );
  };

  return (
    // "relative": see CashflowChart -- keeps the sr-only list inside this card.
    <div className="relative flex min-w-0 flex-col gap-2">
      <div ref={box} className="w-full min-w-0" style={{ minHeight: measured === null ? height : undefined }}>
        {measured !== null && (
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "auto" }}
          className="block max-w-full select-none"
          onMouseLeave={() => setActive(null)}
        >
          <defs>
            {left.map((p, i) => (
              <linearGradient key={`gl${i}`} id={`${uid}-l${i}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor={p.color} />
                <stop offset="1" stopColor={POOL} />
              </linearGradient>
            ))}
            {right.map((p, i) => (
              <linearGradient key={`gr${i}`} id={`${uid}-r${i}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor={POOL} />
                <stop offset="1" stopColor={p.color} />
              </linearGradient>
            ))}
          </defs>

          {/* ribbons first, so the nodes and labels sit on top of them */}
          <g className="animate-chart-fade">
            {left.map((p, i) => (
              <path
                key={`rl${i}`}
                d={ribbon(leftX + nodeW, p.y, p.h, poolX, p.cy, p.ch)}
                fill={`url(#${uid}-l${i})`}
                opacity={active ? (lit("l", i) ? 0.8 : 0.1) : 0.42}
                className="transition-opacity duration-200"
              />
            ))}
            {right.map((p, i) => (
              <path
                key={`rr${i}`}
                d={ribbon(poolX + poolW, p.cy, p.ch, rightX, p.y, p.h)}
                fill={`url(#${uid}-r${i})`}
                opacity={active ? (lit("r", i) ? 0.8 : 0.1) : 0.42}
                className="transition-opacity duration-200"
              />
            ))}
          </g>

          {/* the pool */}
          <rect x={poolX} y={pad} width={poolW} height={room} rx={4} fill="#52525b" />
          <rect x={poolX} y={pad} width={poolW} height={Math.min(room, 6)} rx={3} fill={POOL} />

          {[...left.map((p, i) => ({ p, side: "l" as const, i })), ...right.map((p, i) => ({ p, side: "r" as const, i }))].map(
            ({ p, side, i }) => (
              <g key={`n${side}${i}`}>
                <rect
                  x={side === "l" ? leftX : rightX}
                  y={p.y}
                  width={nodeW}
                  height={p.h}
                  rx={3}
                  fill={p.color}
                  opacity={lit(side, i) ? 1 : 0.4}
                  className="transition-opacity duration-200"
                />
                {/* a roomier invisible target than the node itself: hover and tap */}
                <rect
                  x={side === "l" ? 0 : rightX - 4}
                  y={p.y - 3}
                  width={side === "l" ? leftX + nodeW + 4 : width - rightX + 4}
                  height={p.h + 6}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setActive({ side, i })}
                  onClick={() => pick(side, i)}
                />
              </g>
            )
          )}

          {left.map((p, i) => label(p, "l", i))}
          {right.map((p, i) => label(p, "r", i))}

          {!narrow && (
            <>
              <text x={leftX} y={11} textAnchor="end" fontSize={10} fontWeight={700} letterSpacing="0.08em" className="fill-[var(--ink-5)] uppercase">
                {moneyIn}
              </text>
              <text x={rightX + nodeW} y={11} textAnchor="start" fontSize={10} fontWeight={700} letterSpacing="0.08em" className="fill-[var(--ink-5)] uppercase">
                {moneyOut}
              </text>
            </>
          )}
        </svg>
        )}
      </div>

      <p aria-live="polite" className="min-h-5 text-center text-xs text-[var(--ink-3)]">
        {activeNode ? (
          <>
            <span className="font-semibold text-[var(--ink-1)]">{activeNode.label}</span>
            {" — "}
            <span className="font-semibold tabular-nums">
              {new Intl.NumberFormat("ru-RU").format(Math.round(activeNode.value * 100) / 100)} {currency}
            </span>
            {` · ${share(activeNode.value)}`}
          </>
        ) : (
          totalLabel
        )}
      </p>

      <ul className="sr-only">
        {[...sources, ...uses].map((n) => (
          <li key={`${n.kind}-${n.key}`}>
            {n.label}: {n.value} {currency}
          </li>
        ))}
      </ul>
    </div>
  );
}
