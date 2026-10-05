import type { Currency } from "@/lib/currency";

// Printed documents write sums with the Tajik currency word, not the TJS/USD
// ticker that formatCurrency emits for the screen. Shared by the contract and
// the receipt so a sum never reads differently between the two.
export const CURRENCY_WORD: Record<Currency, string> = {
  TJS: "сомонӣ",
  USD: "доллари ИМА",
};
