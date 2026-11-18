// The database refuses an expense or an advance the balance cannot cover
// (block 078) with the code P0001, the hint "no_funds" and, as `details`, a
// small JSON: which operation, from which pot, which currency, how much there
// is and how much was asked. This turns it into a sentence in the reader's
// language -- the raw message is Russian whatever the interface language is.
type FundsText = {
  errCompany: string;
  errPersonal: string;
  errGive: string;
  errReturn: string;
};

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function describeFundsError(
  error: { hint?: string | null; details?: string | null } | null | undefined,
  text: FundsText
): string | null {
  if (!error || error.hint !== "no_funds" || !error.details) return null;
  try {
    const d = JSON.parse(error.details) as {
      op?: string;
      scope?: string;
      currency?: string;
      available?: number;
      requested?: number;
    };
    const available = `${nf.format(d.available ?? 0)} ${d.currency ?? ""}`.trim();
    const requested = `${nf.format(d.requested ?? 0)} ${d.currency ?? ""}`.trim();
    const template =
      d.op === "give"
        ? text.errGive
        : d.op === "return"
          ? text.errReturn
          : d.scope === "personal"
            ? text.errPersonal
            : text.errCompany;
    return template.replace("{available}", available).replace("{requested}", requested);
  } catch {
    return null;
  }
}
