import type { FinanceCategory } from "@/lib/finance/types";

// The categories a fresh install starts with are stored in Russian. A company
// that works in Tajik can rename them one by one -- or switch all the standard
// ones at once. Only a category whose name is still exactly a standard name is
// touched: anything the company renamed or created itself is left alone.
const DEFAULT_NAMES: Array<{ ru: string; tj: string }> = [
  { ru: "Оплата от клиентов", tj: "Пардохти мизоҷон" },
  { ru: "Аренда", tj: "Иҷора" },
  { ru: "Прочий приход", tj: "Даромади дигар" },
  { ru: "Стройматериалы", tj: "Маводи сохтмон" },
  { ru: "Работы подрядчиков", tj: "Корҳои пудратчиён" },
  { ru: "Зарплата", tj: "Маош" },
  { ru: "Техника и механизмы", tj: "Техника ва механизмҳо" },
  { ru: "Разрешения и проектные работы", tj: "Иҷозатномаҳо ва корҳои лоиҳавӣ" },
  { ru: "Коммунальные услуги", tj: "Хизматрасонии коммуналӣ" },
  { ru: "Налоги и сборы", tj: "Андоз ва боҷҳо" },
  { ru: "Маркетинг", tj: "Маркетинг" },
  { ru: "Прочий расход", tj: "Хароҷоти дигар" },
];

export type NameLanguage = "ru" | "tj";

/** The renames that switch the standard categories to `target`. */
export function presetRenames(
  categories: FinanceCategory[],
  target: NameLanguage
): Array<{ id: string; name: string }> {
  const from: NameLanguage = target === "ru" ? "tj" : "ru";
  const out: Array<{ id: string; name: string }> = [];
  for (const c of categories) {
    const hit = DEFAULT_NAMES.find((d) => d[from] === c.name);
    if (hit && hit[target] !== c.name) out.push({ id: c.id, name: hit[target] });
  }
  return out;
}

// The one category the program files contract payments under keeps a
// translated label only while it still has its standard name.
export const isStandardContractPaymentsName = (name: string) =>
  DEFAULT_NAMES[0].ru === name || DEFAULT_NAMES[0].tj === name;
