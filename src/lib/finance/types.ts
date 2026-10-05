import type { Currency } from "@/lib/currency";
import { isStandardContractPaymentsName } from "@/lib/finance/defaultNames";

export type FinanceKind = "income" | "expense";

export type FinanceCategory = {
  id: string;
  kind: FinanceKind;
  name: string;
  /** Set only on the category the app itself uses ("Оплата от клиентов"). */
  code: string | null;
  sort: number;
  archived: boolean;
};

// One row of the journal, with the two names it is shown with.
export type FinanceEntry = {
  id: string;
  kind: FinanceKind;
  occurred_on: string;
  amount: number;
  currency: Currency;
  category_id: string | null;
  building_id: string | null;
  counterparty: string | null;
  note: string | null;
  /** What the money was for ("Цемент М400"); null on older rows. */
  title: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  /** Filled only on the row mirrored from a contract payment. */
  contract_payment_id: string | null;
  /** Who entered it (their e-mail, stamped by the database); null on older rows. */
  created_by_label?: string | null;
  /** The day it was entered, in the company time zone -- the edit window of a procurement person. */
  entered_on?: string | null;
  category: { name: string; code: string | null } | null;
  building: { name: string } | null;
};

// What crm.finance_overview() returns.
export type FinanceOverview = {
  totals: Array<{ currency: Currency; income: number; expense: number; entries?: number }>;
  by_month: Array<{ month: string; currency: Currency; income: number; expense: number }>;
  by_category: Array<{
    kind: FinanceKind;
    category_id: string | null;
    name: string | null;
    code: string | null;
    currency: Currency;
    total: number;
  }>;
  by_building: Array<{
    building_id: string | null;
    name: string | null;
    currency: Currency;
    income: number;
    expense: number;
  }>;
};

// What crm.finance_cash() returns: the company's real cash, per currency --
// income minus expense since the very first entry, minus money handed out under
// report and not yet spent. Ignores the period and building filters entirely.
export type CashBalance = { currency: Currency; value: number; on_hand: number };

// One person's money under report: issued minus spent, per currency.
export type PersonBalance = { currency: Currency; issued: number; spent: number; balance: number };
export type AdvancePerson = { id: string; email: string; balances: PersonBalance[] };

// One row of a person's merged ledger (crm.finance_person_ledger): their
// expenses and their advances/returns, interleaved by date -- "everything
// about this person in one place" for the accountant. An expense carries
// enough of the real finance_entries columns to open straight in the same
// edit dialog the main journal uses; an advance/return does not (it has no
// category or building -- it is not a categorised expense yet).
export type LedgerEvent = {
  id: string;
  kind: "expense" | "advance" | "return";
  when_date: string;
  created_at: string;
  amount: number;
  currency: Currency;
  title: string | null;
  category_name: string | null;
  category_code: string | null;
  building_name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  /** On an expense: its own note field. On an advance/return: who issued it. */
  note: string | null;
  category_id: string | null;
  building_id: string | null;
  counterparty: string | null;
  contract_payment_id: string | null;
};

// The category the program files contract payments under is stored in the
// company's language at install time; show it in the reader's language.
export function categoryLabel(
  category: { name: string; code: string | null } | null | undefined,
  contractPaymentsLabel: string,
  fallback: string
): string {
  if (!category) return fallback;
  // The program's own category shows in the reader's language while it still
  // has its standard name; once the company renames it, its name is shown.
  return category.code === "contract_payments" && isStandardContractPaymentsName(category.name)
    ? contractPaymentsLabel
    : category.name;
}
