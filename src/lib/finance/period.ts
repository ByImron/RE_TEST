// Reporting periods for the finance screens.

export type PeriodPreset = "month" | "prevMonth" | "quarter" | "year" | "all" | "custom";

export type DateRange = { from: string | null; to: string | null };

// Local calendar dates, not toISOString(): that is UTC, and at half past
// midnight in Dushanbe it still says yesterday -- which would file an evening
// entry under the wrong day and month.
export function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function periodRange(
  preset: PeriodPreset,
  custom: { from: string; to: string },
  now: Date = new Date()
): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "month":
      return { from: localISO(new Date(y, m, 1)), to: localISO(new Date(y, m + 1, 0)) };
    case "prevMonth":
      return { from: localISO(new Date(y, m - 1, 1)), to: localISO(new Date(y, m, 0)) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: localISO(new Date(y, q, 1)), to: localISO(new Date(y, q + 3, 0)) };
    }
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "custom":
      return { from: custom.from || null, to: custom.to || null };
    default:
      return { from: null, to: null };
  }
}

// First day of the month that is `offset` months away from the one containing
// `iso` (YYYY-MM-DD). Parsed by hand: new Date("2026-10-01") is UTC midnight,
// which west of Greenwich is still September.
export function monthStartOffset(iso: string, offset: number): Date {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1 + offset, 1);
}

// "2026-03" -> "мар ’26": short enough to sit under a chart column without
// wrapping (Intl's own "мар. 26 г." does not).
export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Intl.DateTimeFormat(locale === "tj" ? "tg-TJ" : "ru-RU", { month: "short" })
    .format(new Date(y, m - 1, 1))
    .replace(".", "");
  return `${name} ’${String(y).slice(2)}`;
}
