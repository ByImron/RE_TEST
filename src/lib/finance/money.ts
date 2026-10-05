// Exact decimal arithmetic for a money line (quantity x unit price = total).
//
// Floating point cannot be trusted with money: 0.1 * 3 is 0.30000000000000004
// and a rounded sum of such products drifts by a kopeck here and there. The
// figures are parsed from the text the person typed into whole numbers
// (quantity in thousandths, price in ten-thousandths) and multiplied as
// BigInt. The database repeats the same calculation on numeric
// (round(quantity * unit_price, 2), half away from zero) and is the one that
// counts; this only shows the same figure before saving.

export const QTY_SCALE = 3; // 12,500
export const PRICE_SCALE = 4; // 32,5000

// "12 500,5" / "12500.5" -> 12500500n at scale 3. null when it is not a plain
// positive decimal, or has more decimals than the scale allows.
export function parseScaled(raw: string, scale: number): bigint | null {
  const cleaned = raw.replace(/[\s ]/g, "").replace(",", ".");
  const m = /^(\d{1,12})(?:\.(\d+))?$/.exec(cleaned);
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > scale) return null;
  return BigInt(m[1] + frac.padEnd(scale, "0"));
}

// quantity (scale 3) x price (scale 4) -> whole minor units (hundredths),
// rounded half up. The product is at scale 7, so cents = product / 10^5.
export function lineCents(qty: bigint, price: bigint): bigint {
  return (qty * price + BigInt(50000)) / BigInt(100000);
}

// 1250050n at scale 2 -> "12500.50" (plain, for the database).
export function scaledToPlain(n: bigint, scale: number): string {
  const s = n.toString().padStart(scale + 1, "0");
  return scale === 0 ? s : `${s.slice(0, -scale)}.${s.slice(-scale)}`;
}

const groupThousands = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// For screens: "12 500,50" (two decimals) or "12,5" (trimmed) with a comma.
export function formatScaled(n: bigint, scale: number, opts: { trim?: boolean } = {}): string {
  const plain = scaledToPlain(n, scale);
  let [int, frac = ""] = plain.split(".");
  if (opts.trim) frac = frac.replace(/0+$/, "");
  int = groupThousands(int);
  return frac ? `${int},${frac}` : int;
}

export const formatCents = (cents: bigint) => formatScaled(cents, 2);

// Largest total the database accepts (amount < 10^12).
export const MAX_CENTS = BigInt("100000000000000");
