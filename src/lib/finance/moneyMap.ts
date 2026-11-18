// The "money map": where the money of a period came from and where it went, as
// two columns of flows that always balance. Pure arithmetic, kept apart from
// the drawing so it can be reasoned about (and tested) on its own.
//
//   sources (left)                          uses (right)
//   income by category / building   ──►    expense by category / building
//   + "from earlier periods" if the        + "left in the till" if the period
//     period spent more than it earned       earned more than it spent
//
// Both sides are cut to the biggest few and the tail is folded into one
// "other" node, so a long tail of small categories never turns the picture
// into noise -- but nothing is dropped: the two totals stay exact.

export type MapNode = {
  key: string;
  label: string;
  value: number;
  kind: "income" | "expense" | "leftover" | "reserve" | "other";
};

export type FlowInput = { key: string; label: string; value: number };

const EPS = 0.005;

function fold(rows: FlowInput[], limit: number, otherLabel: string, kind: "income" | "expense"): MapNode[] {
  const sorted = rows
    .filter((r) => r.value > EPS)
    .sort((a, b) => b.value - a.value)
    .map<MapNode>((r) => ({ ...r, kind }));
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit - 1);
  const tail = sorted.slice(limit - 1);
  return [
    ...head,
    { key: "__other", label: otherLabel, value: tail.reduce((sum, r) => sum + r.value, 0), kind: "other" },
  ];
}

export function buildMoneyMap({
  income,
  expense,
  maxPerSide = 6,
  labels,
}: {
  income: FlowInput[];
  expense: FlowInput[];
  maxPerSide?: number;
  labels: { other: string; leftover: string; reserve: string };
}): { sources: MapNode[]; uses: MapNode[]; total: number; incomeTotal: number; expenseTotal: number } {
  const sources = fold(income, maxPerSide, labels.other, "income");
  const uses = fold(expense, maxPerSide, labels.other, "expense");
  const incomeTotal = sources.reduce((sum, n) => sum + n.value, 0);
  const expenseTotal = uses.reduce((sum, n) => sum + n.value, 0);
  const net = incomeTotal - expenseTotal;
  // Whatever the period did not spend stays in the till; whatever it spent
  // beyond what came in was paid out of what was already there.
  if (net > EPS) uses.push({ key: "__leftover", label: labels.leftover, value: net, kind: "leftover" });
  else if (net < -EPS) sources.push({ key: "__reserve", label: labels.reserve, value: -net, kind: "reserve" });
  const total = Math.max(incomeTotal, expenseTotal);
  return { sources, uses, total, incomeTotal, expenseTotal };
}
