import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { computeApartmentNumbers } from "@/lib/buildings/apartmentNumbers";
import { unitsOfBuildings } from "@/lib/buildings/apartmentNumbersFor";
import { formatShortDate } from "@/lib/formatDate";
import type { PdfOptions } from "@/lib/export/exportTable";
import { formatCurrency, type Currency } from "@/lib/currency";
import type { ContractDebt } from "@/lib/debtors/debtors";

// What the person who is going to ring everybody needs on one line: who, which
// number, which flat, how much and since when. The flat is more than its name --
// "Кв 12" can sit in any entrance -- so its number (worked out from where it sits
// in the building), floor and area come with it.
export type FlatInfo = { number: number | null; floor: number | null; area: number | null };

/** unit id -> number, floor, area, for the flats these debtors live in. */
export async function loadFlatInfo(
  supabase: SupabaseClient,
  debts: ContractDebt[]
): Promise<Map<string, FlatInfo>> {
  const out = new Map<string, FlatInfo>();
  const wanted = new Set(debts.map((d) => d.objectId).filter((id): id is string => Boolean(id)));
  if (wanted.size === 0) return out;
  const buildings = await unitsOfBuildings(supabase, debts.map((d) => d.buildingId));
  for (const units of buildings.values()) {
    const numbers = computeApartmentNumbers(units);
    for (const u of units) {
      if (wanted.has(u.id)) out.set(u.id, { number: numbers.get(u.id) ?? null, floor: u.floor, area: u.area });
    }
  }
  return out;
}

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function flatCell(d: ContractDebt, info: FlatInfo | undefined, t: Dictionary): string {
  const parts = [d.objectName ?? "—"];
  if (info?.number != null) parts.push(`${t.debtors.call.flatNo}${info.number}`);
  if (info?.floor != null) parts.push(`${info.floor} ${t.debtors.call.floorShort}`);
  if (info?.area != null) parts.push(`${nf.format(info.area)} ${t.debtors.call.areaShort}`);
  return parts.join(" · ");
}

// The columns, known before any data is read (the export menu needs them up front).
export function callListHeaders(t: Dictionary): string[] {
  const c = t.debtors.call;
  return [
    "№",
    t.debtors.client,
    t.clients.table.phone,
    c.building,
    c.flat,
    c.contract,
    c.since,
    c.days,
    t.debtors.overdueNow,
    t.debtors.remainingCol,
    t.debtors.lastPayment,
    t.debtors.monthlyPayment,
    c.currency,
  ];
}

export type CallList = {
  headers: string[];
  rows: Array<Array<string | number>>;
  pdf: PdfOptions;
};

/**
 * The debtors as a table, in the order given. ONE table for both file types:
 * Excel gets real numbers (summable) and a currency column; the printed
 * sheet adds an empty "result of the call" column to write in, and a line with
 * the totals per currency at the end.
 */
export function buildCallList(
  debts: ContractDebt[],
  flats: Map<string, FlatInfo>,
  t: Dictionary
): CallList {
  const c = t.debtors.call;
  const headers = callListHeaders(t);
  const rows = debts.map((d, i) => [
    i + 1,
    d.clientName,
    d.clientPhone ?? "",
    d.buildingName ?? "",
    flatCell(d, d.objectId ? flats.get(d.objectId) : undefined, t),
    d.contractNumber ?? "",
    formatShortDate(d.earliestDue),
    d.daysOverdue,
    d.totalOverdue,
    d.remainingTotal,
    d.lastPaymentDate ? formatShortDate(d.lastPaymentDate) : t.debtors.noPayments,
    d.monthlyPayment ?? "",
    d.currency,
  ]);

  // Totals per currency (TJS and USD are never added together).
  const totals = new Map<Currency, number>();
  for (const d of debts) totals.set(d.currency, (totals.get(d.currency) ?? 0) + d.totalOverdue);
  const totalText = [...totals.entries()].map(([cur, sum]) => formatCurrency(sum, cur)).join(" · ");

  return {
    headers,
    rows,
    pdf: {
      extraColumns: [c.result],
      // the client and the phone are what the caller looks for first; a phone number,
      // building, contract number and date each stay on one line
      strongColumns: [1, 2],
      nowrapColumns: [2, 3, 5, 6],
      subtitle: c.subtitle.replace("{n}", String(debts.length)),
      footer: totalText ? c.footer.replace("{sum}", totalText) : undefined,
    },
  };
}
