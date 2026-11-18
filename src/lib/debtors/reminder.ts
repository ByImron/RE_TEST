import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatCurrency } from "@/lib/currency";
import { isWhatsAppPhone, normalizeTjPhone } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import type { ContractDebt } from "@/lib/debtors/debtors";

// The reminder about a debt, in ONE place: the WhatsApp button on a single row
// and the round to every debtor both use it, so a change of wording happens once.
// One contract reads as the short sentence; a client who is behind on several
// contracts gets one message listing them, not one message per contract.
export function reminderText(debts: ContractDebt[], t: Dictionary): string {
  const first = debts[0];
  const one = (d: ContractDebt) =>
    t.debtors.reminderMsg
      .replace("{name}", d.clientName)
      .replace("{contract}", d.contractNumber ?? "—")
      .replace("{amount}", formatCurrency(d.totalOverdue, d.currency))
      .replace("{days}", String(d.daysOverdue));
  if (debts.length === 1) return one(first);
  const lines = debts
    .map((d) =>
      t.debtors.reminderLine
        .replace("{contract}", d.contractNumber ?? "—")
        .replace("{amount}", formatCurrency(d.totalOverdue, d.currency))
        .replace("{days}", String(d.daysOverdue))
    )
    .join("\n");
  return t.debtors.reminderMsgMany.replace("{name}", first.clientName).replace("{lines}", lines);
}

export type WhatsAppRecipient = {
  /** The normalised number -- also what makes two contracts one recipient. */
  phone: string;
  name: string;
  debts: ContractDebt[];
  text: string;
  url: string;
};

/**
 * Debtors -> people to message. Contracts of the same number become one
 * recipient with one message; debtors without a usable number are returned
 * apart so the screen can say who was left out instead of dropping them silently.
 * The order of the list is kept (first appearance of each number).
 */
export function groupForWhatsApp(
  debts: ContractDebt[],
  t: Dictionary
): { recipients: WhatsAppRecipient[]; withoutPhone: ContractDebt[] } {
  const byPhone = new Map<string, ContractDebt[]>();
  const withoutPhone: ContractDebt[] = [];
  for (const d of debts) {
    if (!isWhatsAppPhone(d.clientPhone)) {
      withoutPhone.push(d);
      continue;
    }
    const key = normalizeTjPhone(d.clientPhone);
    const list = byPhone.get(key);
    if (list) list.push(d);
    else byPhone.set(key, [d]);
  }
  const recipients = [...byPhone.entries()].map(([phone, list]) => {
    const text = reminderText(list, t);
    return { phone, name: list[0].clientName, debts: list, text, url: waLink(phone, text) };
  });
  return { recipients, withoutPhone };
}
