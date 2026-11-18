import type { SupabaseClient } from "@supabase/supabase-js";
import type { Currency } from "@/lib/currency";

// The one place that knows what a debtor row is and how the whole list is read.
// The Debtors page (a page at a time), the call-list export and the WhatsApp
// round all need "every debtor under the current filter, in the order on
// screen" -- they used to be able to disagree about it, and the export did: it
// paged through the list WITHOUT an order, so a list longer than one batch could
// repeat one debtor and skip another between batches.

// One reminder PER CONTRACT, not per missed installment. A long installment
// plan with nothing paid used to spill one row per overdue month (9, 20, 30
// rows for the same flat); now it's a single line summing what's overdue.
// Paid installments drop out on their own, so recording a payment shrinks the
// reminder and fully closing the plan removes it entirely.
export type ContractDebt = {
  contractId: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string | null;
  /** The flat: its id (to look its number up), its name and the building it is in. */
  objectId: string | null;
  objectName: string | null;
  /** Entrance / block label and floor of the flat (block 081) -- with the flat's number they say where it is. */
  objectBlock: string | null;
  objectFloor: number | null;
  buildingId: string | null;
  buildingName: string | null;
  contractNumber: string | null;
  currency: Currency;
  missedCount: number;
  totalOverdue: number;
  // The whole balance of the contract, not just the overdue slice -- the two
  // were being confused for each other on screen.
  remainingTotal: number;
  // Earliest missed date = since when in arrears; latest = the current period
  // to chase. Days overdue is measured from the latest, so it reflects the
  // present cycle and rolls forward each month instead of ballooning to 785.
  earliestDue: string;
  latestDue: string;
  daysOverdue: number;
  /** Date of the last REAL payment (a received one, not a plan row); null = never paid. Block 081. */
  lastPaymentDate: string | null;
  /** The usual monthly instalment of the plan (median of its unpaid rows). Block 081. */
  monthlyPayment: number | null;
};

// A row exactly as crm.overdue_contracts() returns it. object_id arrived with
// block 079: an older database simply leaves it out (the flat's number is then
// not looked up, everything else works).
export type OverdueRow = {
  contract_id: string;
  contract_number: string | null;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  object_id?: string | null;
  object_name: string | null;
  object_block?: string | null;
  object_floor?: number | null;
  building_id?: string | null;
  building_name?: string | null;
  currency: Currency;
  missed_count: number;
  total_overdue: number;
  remaining_total: number | null;
  earliest_due: string;
  latest_due: string;
  /** Since block 081; an older database leaves them out. */
  last_payment_date?: string | null;
  monthly_payment?: number | string | null;
};

export function toDebt(r: OverdueRow, now: number): ContractDebt {
  return {
    contractId: r.contract_id,
    clientId: r.client_id,
    clientName: r.client_name,
    clientPhone: r.client_phone,
    objectId: r.object_id ?? null,
    objectName: r.object_name,
    objectBlock: r.object_block ?? null,
    objectFloor: r.object_floor ?? null,
    buildingId: r.building_id ?? null,
    buildingName: r.building_name ?? null,
    contractNumber: r.contract_number,
    currency: r.currency,
    missedCount: r.missed_count,
    totalOverdue: Number(r.total_overdue),
    remainingTotal: Number(r.remaining_total ?? 0),
    earliestDue: r.earliest_due,
    latestDue: r.latest_due,
    // Measured from the LATEST missed date, so it reflects the current cycle
    // and rolls forward each month instead of ballooning.
    daysOverdue: Math.floor((now - new Date(r.latest_due).getTime()) / 86_400_000),
    lastPaymentDate: r.last_payment_date ?? null,
    monthlyPayment: r.monthly_payment == null ? null : Number(r.monthly_payment),
  };
}

export type DebtSortKey = "freshest" | "lastPayment" | "overdue" | "oldest" | "name";

// Which column each choice orders by, applied in the database so the order
// holds across pages.
export const DEBT_SORTS: Record<DebtSortKey, { column: string; ascending: boolean; nullsFirst?: boolean }> = {
  // Most recently missed payment first -- who fell behind TODAY, then
  // yesterday, then a few days ago. These are the calls most worth making
  // first: still fresh enough that a reminder alone often fixes it, before
  // it drifts into "oldest" territory further down the list.
  freshest: { column: "latest_due", ascending: false },
  // Longest without paying anything first. Never paid at all (no date) is the longest
  // gap there is, so those come first.
  lastPayment: { column: "last_payment_date", ascending: true, nullsFirst: true },
  overdue: { column: "total_overdue", ascending: false },
  oldest: { column: "earliest_due", ascending: true },
  name: { column: "client_name", ascending: true },
};

// PostgREST will not hand back more than this in one response anyway.
const BATCH = 1000;

/**
 * EVERY debtor under the filter, in the order the page shows. Read in batches
 * of 1000, each ordered by the chosen column and then by contract id -- without
 * the unique tiebreaker equal values can come back in a different order per
 * batch, which lists one debtor twice and another never.
 */
export async function fetchAllDebtors(
  supabase: SupabaseClient,
  { buildingId, sort }: { buildingId: string; sort: DebtSortKey }
): Promise<ContractDebt[]> {
  const order = DEBT_SORTS[sort];
  const now = Date.now();
  const all: ContractDebt[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase
      .schema("crm")
      .rpc("overdue_contracts", { p_building_id: buildingId === "all" ? null : buildingId })
      .order(order.column, { ascending: order.ascending, nullsFirst: order.nullsFirst })
      .order("contract_id", { ascending: true })
      .range(from, from + BATCH - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as OverdueRow[];
    all.push(...batch.map((r) => toDebt(r, now)));
    if (batch.length < BATCH) break;
  }
  return all;
}
