// Build a wa.me link that opens WhatsApp with the number and a ready message
// filled in -- the manager just presses send. No API, no cost, no approval:
// the simplest reminder channel, and the one people in Tajikistan actually
// use. Auto-sending stays a separate (optional) feature.

import { normalizeTjPhone } from "@/lib/phone";

export function waLink(phone: string | null | undefined, text: string): string {
  const p = normalizeTjPhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
