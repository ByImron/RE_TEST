// Normalises whatever a manager typed into the client/task form (spaces,
// dashes, a leading +, or no country code at all) into a bare digit string
// with the Tajik country code: 992XXXXXXXXX.
//
// This bare form is what WhatsApp deep links (wa.me/992...) want. The SMS
// gateway wants the same number WITH a leading plus -- see smsGatewayPhone
// below.
export function normalizeTjPhone(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("992")) return d; // already has the Tajik country code
  if (d.length === 9) return `992${d}`; // bare local number
  return d;
}

// The number in the exact shape Payom.tj documents for its own API:
//
//   { "telephone": "+992006338598", ... }
//
// The leading plus matters. Everything here was sending the bare "992..."
// form -- which is right for wa.me and wrong for the gateway -- so the
// requests went out looking valid and the messages did not arrive. Kept as a
// separate helper rather than a change to normalizeTjPhone, because the
// WhatsApp links genuinely need the version without the plus.
export function smsGatewayPhone(phone: string | null | undefined): string {
  const digits = normalizeTjPhone(phone);
  return digits ? `+${digits}` : "";
}

// Can this number be opened in WhatsApp at all? WhatsApp has no way to ask
// "does this number have an account" without sending, so this only rules out what
// can never work: nothing typed, or too few/many digits to be an international
// number (a stray "12" or a pasted passport number). A Tajik mobile number in any
// of its written forms comes out as 992 + 9 digits = 12; the loose 11-15 window
// lets other countries' numbers through.
export function isWhatsAppPhone(phone: string | null | undefined): boolean {
  const digits = normalizeTjPhone(phone);
  return digits.length >= 11 && digits.length <= 15;
}
