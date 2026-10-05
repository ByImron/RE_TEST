"use client";

import { useSettings } from "@/lib/settings/SettingsProvider";
import { bareCompanyName } from "@/lib/settings/companyName";
import { documentFont } from "@/lib/documentFont";
import type { Currency } from "@/lib/currency";
import { amountToWordsTj } from "@/lib/contracts/amountToWordsTj";
import { CURRENCY_WORD } from "@/lib/contracts/currencyWord";
import type { ContractPayment, PaymentType } from "@/lib/contracts/types";

export type ContractDocumentData = {
  number: string | null;
  signed_date: string | null;
  amount: number;
  paid_amount: number;
  amount_words: string | null;
  currency: Currency;
  payment_type: PaymentType;
  installment_months: number | null;
  client: {
    name: string;
    phone: string | null;
    passport: string | null;
    passport_issued_by: string | null;
    birth_date: string | null;
    address: string | null;
  } | null;
  object: {
    name: string;
    address: string | null;
    area: number | null;
    floor: number | null;
    block: string | null;
    rooms: number | null;
    building: { name: string; address: string | null; price_per_sqm: number | null } | null;
  } | null;
};

const FONT = documentFont.style;

// The paper contract writes sums as "340000 сомонӣ" / "6355,14 сомонӣ" --
// the Tajik currency word, not the TJS ticker that formatCurrency emits for
// the screen, and a decimal comma with no thousands spaces.
function docAmount(value: number, currency: Currency): string {
  const hasFraction = Math.round(value * 100) % 100 !== 0;
  const num = hasFraction ? value.toFixed(2).replace(".", ",") : String(Math.round(value));
  return `${num} ${CURRENCY_WORD[currency]}`;
}

// Areas print as "53,50 м²" -- two decimals, decimal comma.
function docArea(value: number | null): string {
  return value == null ? "__" : value.toFixed(2).replace(".", ",");
}

function shortDate(iso: string | null): string {
  if (!iso) return "__.__.____";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

// Colours are picked for a black-and-white laser printer, which is how these
// mostly get printed: every text colour is a dark ink tone, so nothing fades
// out on grey-scale (a pale or yellow-ish text colour does exactly that --
// brass lettering printed as a ghost). The accent is the site's near-black --
// the same ink as the receipt and the sign-in screen -- and the site's yellow
// appears only as the thick line of the double rule, a border, never lettering.
// Structure comes from rules and weight, never from fills: browsers drop
// background colours when printing by default, so a tinted panel or a filled
// disc silently disappears.
const ACCENT = "#18181b";
const INK = "#0f172a";
// Divider tone for hairlines: dark enough to survive grey-scale, light enough
// to stay quiet next to the text.
const HAIR = "#9aa6b6";
// Decorative fills only (never anything that must be read): ask the browser to
// paint them even though background graphics are off by default. If a printer
// or browser ignores this, the page is still complete -- text sits on paper.
const PRINT_EXACT = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;

// Width of the left gutter that section numbers and clause numbers hang in.
// Text (every line of it) starts at this indent, so the numbers stand alone in
// the margin like a legal document's, instead of being circled badges.
const GUTTER = "1.9rem";

const LABEL = "text-[8.5px] font-semibold uppercase tracking-[0.12em] text-slate-600";

// A thick rule over a hairline: the document's one recurring ornament
// (letterhead foot, page titles). Plain borders, so it prints everywhere.
function DoubleRule({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <div style={{ borderTop: "2.5px solid var(--accent-yellow)" }} />
      <div className="mt-[2px]" style={{ borderTop: `0.75px solid ${ACCENT}` }} />
    </div>
  );
}

// Section heading: the number hangs alone in the left gutter, the title sits
// on the text edge, and a hairline above separates it from the previous
// section. No circle around the number.
function Section({ num, title }: { num: number; title: string }) {
  return (
    <div
      style={{ borderTop: `0.75px solid ${HAIR}` }}
      className="mt-3 flex items-baseline break-inside-avoid break-after-avoid pt-1.5"
    >
      <span
        style={{ width: GUTTER, color: ACCENT }}
        className="shrink-0 text-[16px] font-bold leading-none tabular-nums"
      >
        {num}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.1em]">{title}</span>
    </div>
  );
}

// One clause: its number hangs in the gutter and every line of the text
// aligns to the same left edge (padding + negative indent), which stays
// intact when the paragraph runs onto a second page. An inline-block number
// rather than a flex row, because Chrome will not split a flex container
// across printed pages. Without `n` it is an unnumbered paragraph indented to
// the same edge.
function Clause({ n, children }: { n?: string; children: React.ReactNode }) {
  return (
    <p
      className="text-justify"
      style={{ paddingLeft: GUTTER, textIndent: n ? `-${GUTTER}` : undefined }}
    >
      {n && (
        <span
          style={{ display: "inline-block", width: GUTTER, textIndent: 0, color: ACCENT }}
          className="font-bold tabular-nums"
        >
          {n}
        </span>
      )}
      {children}
    </p>
  );
}

// Data that changes with every deal -- buyer, apartment, sums, dates.
// Bold and underlined so the document reads as a completed form and staff can
// eyeball the substituted values before signing. The company's own details
// are deliberately NOT marked this way: they're constant.
function Var({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        textDecoration: "underline",
        textDecorationColor: ACCENT,
        textDecorationThickness: "0.6px",
        textUnderlineOffset: "2.5px",
      }}
      className="font-bold"
    >
      {children}
    </span>
  );
}

// A party's block: accent rule on top, role, details, then a plain signature
// line with its caption underneath ("имзо", plus "М. П." where a stamp goes).
// A drawn line rather than a dashed box -- it is what a pen actually needs,
// and it prints as a line on every printer.
function Party({
  role,
  stamp,
  date,
  children,
}: {
  role: string;
  stamp?: boolean;
  date?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ borderTop: `1.5px solid ${ACCENT}` }}
      className="flex flex-col break-inside-avoid"
    >
      <p
        style={{ color: ACCENT }}
        className="pt-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
      >
        {role}
      </p>
      <div className="mt-1">{children}</div>
      <div className="mt-auto pt-9">
        <div style={{ borderTop: `0.75px solid ${INK}` }} />
        <div className="mt-0.5 flex justify-between text-[9px] text-slate-600">
          <span>имзо</span>
          {stamp && <span>М. П.</span>}
        </div>
        {date && (
          <p className="mt-1.5">
            Санаи <Var>{date}</Var>
          </p>
        )}
      </div>
    </div>
  );
}

// Title of an annex page (ЗАМИМА, payment schedule): small caption naming the
// contract it belongs to, the title, then the double rule.
function DocTitle({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <div>
      {kicker && <p className={LABEL}>{kicker}</p>}
      <h2 className="mt-0.5 text-[19px] font-bold leading-tight tracking-[0.08em]">{title}</h2>
      <DoubleRule className="mt-1.5" />
    </div>
  );
}

// The company's official cooperation contract (ШАРТНОМАИ ҲАМКОРӢ), wording
// taken verbatim from Намунаи шартномаи Бурҷи Бохтар.docx -- only the
// party/apartment/amount specifics are substituted from the deal. Section
// and clause numbers are kept exactly as in the paper original, because the
// text itself cross-references them ("дар банди 2.2 шартномаи мазкур").
export function ContractDocument({
  contract,
  payments,
  copyLabel,
  apartmentNumber,
}: {
  contract: ContractDocumentData;
  payments: ContractPayment[];
  copyLabel?: string;
  apartmentNumber?: number;
}) {
  const { settings } = useSettings();

  // Bare name: the document supplies the legal form itself, so a stored
  // "ЧДММ «Х»" would otherwise print as "ҶДММ «ЧДММ «Х»»".
  const companyName = bareCompanyName(settings.company_name) || "____________";
  const director = settings.company_director || "____________";
  // Signing city + dispute-court jurisdiction below both follow the COMPANY's
  // own city (Settings -> company_city), never a fixed one: this template is
  // resold to different companies in different cities, and a fixed city here
  // would print the wrong signing place and the wrong court for every
  // company that isn't based wherever this default was written for.
  const companyCity = settings.company_city || "____________";
  const buildingAddress =
    contract.object?.building?.address ?? contract.object?.address ?? "____________";
  // The price per m² printed on the contract is THIS deal's individually
  // negotiated rate -- the contract's own total divided by the unit's area --
  // not the building's default listing rate. So a client given a special
  // price sees that price on paper, and re-editing the contract amount
  // re-derives it. Falls back to the building default only when the deal has
  // no usable amount/area yet.
  const dealArea = contract.object?.area ?? null;
  const pricePerSqm =
    dealArea && dealArea > 0 && contract.amount > 0
      ? Math.round((contract.amount / dealArea) * 100) / 100
      : contract.object?.building?.price_per_sqm ?? null;

  const amountWords =
    contract.amount_words || amountToWordsTj(contract.amount, contract.currency);

  const aptNo = apartmentNumber != null ? String(apartmentNumber) : "____";
  // A DRAFT template, not vetted legal wording -- see the isRent branches
  // below throughout this component. Flagged in chat when this was added:
  // review before actually handing one to a tenant to sign.
  const isRent = contract.payment_type === "rent";
  const paymentLabel = isRent
    ? `Иҷора · ${contract.installment_months ?? "__"} моҳ`
    : contract.payment_type === "installment"
      ? `Бо қисм · ${contract.installment_months ?? "__"} моҳ`
      : contract.payment_type === "barter"
        ? "Бартер"
        : "Якбора";
  const sellerLabel = isRent ? "АРЕНДОДАТЕЛЬ" : "Фурӯшанда";
  const buyerLabel = isRent ? "АРЕНДАТОР" : "Харидор";
  const sellerLabelUpper = isRent ? "АРЕНДОДАТЕЛЬ" : "ФУРӮШАНДА";
  const buyerLabelUpper = isRent ? "АРЕНДАТОР" : "ХАРИДОР";
  // Block/entrance is its own line, not joined into the same string as
  // floor/area/rooms: a block name like "Блоки А / Даромадгоҳи 1" is long
  // enough on its own to wrap, and wrapping it next to unrelated short items
  // used to break the line mid-phrase ("...Даромадгоҳи" / "1 · ошёнаи 7...").
  // Kept apart, each line only ever wraps within itself.
  const railBlock = contract.object?.block ?? null;
  // Order matters here: floor first (which floor the buyer walks onto), then
  // area, then room count -- matches how the company reads out a unit
  // verbally and how the paper contract should read too.
  const railSpecs = [
    contract.object?.floor != null ? `ошёнаи ${contract.object.floor}` : null,
    contract.object?.rooms != null ? `${contract.object.rooms} ҳуҷра` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const scheduleTotal = payments.reduce((sum, p) => sum + p.amount, 0);

  // Schedule summary derived from the ACTUAL rows, not recomputed from
  // amount/installment_months -- otherwise a hand-edited plan (irregular down
  // payments, extra one-off payments) printed a headline that contradicted the
  // table below it. Paid-so-far and the remaining count/typical monthly all
  // come straight from the payment rows the table renders.
  const paidRows = payments.filter((p) => p.paid);
  const unpaidRows = payments.filter((p) => !p.paid);
  const paidSoFar = paidRows.reduce((sum, p) => sum + p.amount, 0);
  const remainingSchedule = unpaidRows.reduce((sum, p) => sum + p.amount, 0);
  const typicalMonthly =
    unpaidRows.length > 0
      ? Math.round((remainingSchedule / unpaidRows.length) * 100) / 100
      : null;

  // Grouped into the same 4 practical categories as the work itself
  // (facade/entrance, grounds, in-unit, utilities) rather than one flat
  // run of 14 -- makes the printed table scannable, not just numbered.
  const workCategories: { category: string; items: string[] }[] = [
    {
      category: "Намо ва даромадгоҳ",
      items: [
        "Ороиши намо тибқи лоиҳа.",
        "Ороиши пурраи даромадгоҳи бино.",
        "Зинаҳои печдор бо тахтасангҳо (кафел).",
        "Насбкунии лифт.",
      ],
    },
    {
      category: "Ободонии ҳудуд",
      items: [
        "Насби таҷҳизотҳои рӯшноӣ дар зинапояҳо ва даромадгоҳ.",
        "Ободонии гирду атрофи бино.",
        "Сохт ва омодасозии майдончаи бозиҳои кӯдакона.",
      ],
    },
    {
      category: "Дохили хона",
      items: ["Насби дарҳои хонаҳо аз масолеҳи оҳанӣ.", "Тирезаҳо аз ПВХ, истеҳсоли Туркия."],
    },
    {
      category: "Шабакаҳои муҳандисӣ",
      items: [
        "Нуқтаи пайвасти синамо (телевизион).",
        "Пайвасти ноқилҳои барқӣ то нуқтаи аввал.",
        "Нуқтаи пайвасти обу корези (канализатсия).",
        "Ноқили пайвасти дар даромадгоҳ бо дамафон (domofon).",
        "Ноқилҳои пайвасти телефон, интернет ва WiFi.",
      ],
    },
  ];
  // Flattened once, with a running № carried across category boundaries,
  // so the table body below is a plain .map over category-header rows and
  // numbered-item rows instead of nested maps with hand-tracked counters.
  type WorkRow =
    | { kind: "cat"; key: string; label: string }
    | { kind: "item"; key: string; n: number; text: string };
  const worksRows: WorkRow[] = (() => {
    const rows: WorkRow[] = [];
    let n = 0;
    for (const group of workCategories) {
      rows.push({ kind: "cat", key: `cat-${group.category}`, label: group.category });
      for (const item of group.items) {
        n += 1;
        rows.push({ kind: "item", key: `item-${n}`, n, text: item });
      }
    }
    return rows;
  })();

  // Watermark: the company logo, washed out and centred behind the text,
  // same as the Word original. Deliberately an <img> rather than a CSS
  // background -- browsers skip background graphics when printing unless
  // the user ticks that box, but real images always print.
  //
  // Rendered only on ЗАМИМА and the payment schedule -- NOT the main body.
  // Both of those force their own fresh printed page (print:break-before-
  // page) and are padded to fill it (print:min-h-screen on their wrapper),
  // so a mark centred on either lands dead-centre of that one physical
  // page. The main body has no such guarantee: it's the one block that can
  // run past a single page on its own (all 9 sections + signatures), and a
  // mark centred on its whole height then lands correctly on only whichever
  // ONE physical page happens to contain that combined midpoint -- visibly
  // off-centre (or missing) on every other page the body spans.
  //
  // Tried and rejected fixes for the main body specifically: position:fixed
  // repeats per page but clips the document to one viewport-height slice
  // instead of paginating it (#contract-print-area's own print rules in
  // globals.css already tried and dropped that); a tiled set of absolute
  // copies at fixed mm offsets does cover a multi-page body, but made
  // things WORSE -- an actual print preview showed several extra blank
  // sheets appended after the real content, one per unused tile, because
  // Chrome's pagination counts that absolutely-positioned reach even under
  // overflow-hidden. Leaving the main body unmarked is the version that's
  // actually reliable: never off-centre anywhere, at the cost of the bulk
  // of the legal text not carrying the watermark.
  const watermark = settings.company_logo_url && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={settings.company_logo_url}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 w-[62%] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.12]"
    />
  );

  return (
    <div
      style={FONT}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white text-[11px] leading-[1.42] text-slate-900 shadow-sm print:rounded-none print:border-0 print:shadow-none"
    >
      <div className="relative">
        {copyLabel && <p className={`${LABEL} px-9 pt-3 text-right`}>{copyLabel}</p>}

        {/* Letterhead: the company's fixed identity, then the double rule.
            Everything here is constant across every contract the company
            ever prints -- the deal's own identity (title, number, date) is
            set below it. */}
        <div className="px-9 pt-4">
          <div className="flex items-center gap-3.5 pb-3">
            {settings.company_logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.company_logo_url}
                alt=""
                className="h-12 w-12 shrink-0 object-contain"
              />
            )}
            <div className="min-w-0 leading-[1.4]">
              <p className="text-[15px] font-bold tracking-tight">ҶДММ «{companyName}»</p>
              {settings.company_address && (
                <p className="text-[10px] text-slate-700">{settings.company_address}</p>
              )}
              {settings.company_bank_details && (
                <p className="text-[9.5px] text-slate-600">{settings.company_bank_details}</p>
              )}
            </div>
          </div>
          <DoubleRule />
        </div>

        {/* print:block: this is the whole letter body (all 9 sections + the
            signatures), routinely taller than one printed page. Chrome's
            print engine doesn't fragment display:flex containers across
            page breaks the way it does plain block content -- content got
            cut off mid-line or an entire remaining stretch jumped whole to
            the next page. Block flow lets the page-break-inside/orphans/
            widows rules on #contract-print-area (globals.css) do their job. */}
        <div className="flex flex-col gap-1.5 px-9 pb-6 pt-4 print:block">
          {/* Title: left-aligned, the contract number set against it on the
              right in the accent, then place and date on one line. */}
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-[21px] font-bold leading-none tracking-[0.06em]">
              {isRent ? "ШАРТНОМАИ ИҶОРА" : "ШАРТНОМАИ ҲАМКОРӢ"}
            </h1>
            <p style={{ color: ACCENT }} className="shrink-0 text-[18px] font-bold leading-none tabular-nums">
              №{contract.number || "____"}
            </p>
          </div>
          <div className="flex items-baseline justify-between text-[12px] print:mt-1">
            <span className="font-bold">ш. {companyCity}</span>
            <Var>{shortDate(contract.signed_date)}</Var>
          </div>

          {/* Deal summary ("Маълумоти аҳд") as ONE compact card: the flat on
              the left (a big number in a soft yellow cell), the two figures that
              matter beside it, then seller and buyer side by side. Two rows, no
              ruled table -- the ruled list it replaces read like a spreadsheet
              and ran to twice the height. Every figure lives here; the clauses
              below reference it instead of repeating the numbers. Lines are
              <div>s, not <p>: the print stylesheet gives every <p> a bottom
              margin. */}
          <section
            style={{ border: `1px solid ${ACCENT}` }}
            className="mt-3 break-inside-avoid overflow-hidden rounded-[7px]"
          >
            <div
              style={{ color: ACCENT, borderBottom: `0.75px solid ${ACCENT}` }}
              className="px-3.5 py-[3px] text-[9px] font-bold uppercase tracking-[0.18em]"
            >
              Маълумоти аҳд
            </div>
            <div className="grid grid-cols-[9.5rem_1fr]">
              <div
                style={{
                  ...PRINT_EXACT,
                  background: "color-mix(in srgb, var(--accent-yellow) 24%, #ffffff)",
                  borderRight: `0.75px solid ${ACCENT}`,
                }}
                className="px-3.5 py-2.5"
              >
                <div className={LABEL}>Хона</div>
                <div className="mt-0.5 text-[30px] font-bold leading-none tabular-nums">
                  №{aptNo}
                </div>
                {(railBlock || railSpecs) && (
                  <div className="mt-1.5 text-[10px] leading-snug text-slate-800">
                    {railBlock && <div>{railBlock}</div>}
                    {railSpecs && <div>{railSpecs}</div>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 content-center gap-x-5 px-4 py-2.5">
                <div className="min-w-0">
                  <div className={LABEL}>{isRent ? "Маблағи умумии иҷора" : "Маблағи умумӣ"}</div>
                  <div className="mt-0.5 text-[16px] font-bold leading-tight tabular-nums">
                    {docAmount(contract.amount, contract.currency)}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-snug text-slate-700">{paymentLabel}</div>
                </div>
                <div className="min-w-0">
                  <div className={LABEL}>Масоҳат</div>
                  <div className="mt-0.5 text-[16px] font-bold leading-tight tabular-nums">
                    {docArea(contract.object?.area ?? null)} м²
                  </div>
                  {pricePerSqm != null && (
                    <div className="mt-0.5 text-[10px] leading-snug text-slate-700">
                      Нарх/м²: {docAmount(pricePerSqm, contract.currency)}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div
              style={{ borderTop: `0.75px solid ${ACCENT}` }}
              className="grid grid-cols-2"
            >
              <div className="min-w-0 px-3.5 py-2">
                <div className={LABEL}>{sellerLabel}</div>
                <div className="mt-0.5 text-[12px] font-bold leading-tight">
                  ҶДММ «{companyName}»
                </div>
              </div>
              <div
                style={{ borderLeft: `0.75px solid ${ACCENT}` }}
                className="min-w-0 px-3.5 py-2"
              >
                <div className={LABEL}>{buyerLabel}</div>
                <div className="mt-0.5 text-[12px] font-bold leading-tight">
                  {contract.client?.name ?? "____________"}
                </div>
                {contract.client?.passport && (
                  <div className="mt-0.5 text-[10px] leading-snug text-slate-700">
                    Шиноснома: {contract.client.passport}
                  </div>
                )}
              </div>
            </div>
          </section>

          <Section num={1} title="Тарафҳои аҳдкунанда" />
          {isRent ? (
            <Clause>
              Ҷамъияти дорои масъулияти маҳдуди «{companyName}» дар шахсияти роҳбари ҷамъият{" "}
              <b>{director}</b>, ки дар асоси Оинномаи ҷамъият амал мекунад, аз як тараф,
              минбаъд <b>«АРЕНДОДАТЕЛЬ»</b> ва аз тарафи дигар шаҳрванди Ҷумҳурии Тоҷикистон{" "}
              <Var>{contract.client?.name ?? "____________"}</Var>
              {contract.client?.passport ? ", шиноснома № " : ""}
              {contract.client?.passport && <Var>{contract.client.passport}</Var>}
              {contract.client?.passport_issued_by ? ", дода шудааст аз ҷониби " : ""}
              {contract.client?.passport_issued_by && (
                <Var>{contract.client.passport_issued_by}</Var>
              )}
              , ки минбаъд <b>«АРЕНДАТОР»</b> номида мешавад, ҳамин шартномаро оид ба иҷораи
              хона бо шартҳои зерин бастанд.
            </Clause>
          ) : (
            <Clause>
              Ҷамъияти дорои масъулияти маҳдуди «{companyName}» дар шахсияти роҳбари ҷамъият{" "}
              <b>{director}</b>, ки дар асоси Оинномаи ҷамъият амал мекунад, аз як тараф,
              минбаъд <b>«Фурӯшанда»</b> ва аз тарафи дигар шаҳрванди Ҷумҳурии Тоҷикистон{" "}
              <Var>{contract.client?.name ?? "____________"}</Var>
              {contract.client?.passport ? ", шиноснома № " : ""}
              {contract.client?.passport && <Var>{contract.client.passport}</Var>}
              {contract.client?.passport_issued_by ? ", дода шудааст аз ҷониби " : ""}
              {contract.client?.passport_issued_by && (
                <Var>{contract.client.passport_issued_by}</Var>
              )}
              , ки минбаъд <b>«Харидор»</b> номида мешавад, ҳамин шартномаро бо шартҳои зерин
              бастанд.
            </Clause>
          )}

          <Section num={2} title="Мақсади шартнома" />
          {isRent ? (
            <>
              <Clause n="2.1">Мутобиқи шартномаи мазкур «АРЕНДОДАТЕЛЬ» ҳуҷраи (хонаи){" "}
                <Var>№{aptNo}</Var>-ро, воқеъ дар <Var>{buildingAddress}</Var>, бо
                нишондиҳандаҳои дар «Маълумоти аҳд»-и боло овардашуда (масоҳат, нарх барои
                1 м²), бо шартҳои иҷора ба «АРЕНДАТОР» месупорад.
              </Clause>
              <Clause n="2.2">Мӯҳлати иҷора{" "}
                <Var>{contract.installment_months ?? "__"} моҳ</Var>-ро ташкил медиҳад, аз
                санаи <Var>{shortDate(contract.signed_date)}</Var> сар карда.
              </Clause>
              <Clause n="2.3">«АРЕНДАТОР» уҳдадор мешавад маблағи иҷораро дар андозаи дар «Маълумоти
                аҳд» нишондодашуда ({amountWords}), тибқи ҷадвали замимашудаи пардохт, ҳар моҳ
                пардохт намояд.
              </Clause>
              <Clause n="2.4">Супоридани ҳуҷра (хона) ба иҷора моликияти онро ба «АРЕНДАТОР» интиқол
                намедиҳад — ба «АРЕНДАТОР» танҳо ҳуқуқи истифодабарии муваққатӣ дар давоми
                мӯҳлати шартномаи мазкур дода мешавад.
              </Clause>
            </>
          ) : (
            <>
              <Clause n="2.1">Бо мақсади вусъат бахшидани рафти сохтмони биноҳои истиқоматии баландошёна
                бо пентхаус, дар ошёнаи якум маркази савдо ва хизматрасонӣ ва дар таҳхонаҳои онҳо
                ташкил намудани таваққуфгоҳи зеризаминӣ, воқеъ дар <Var>{buildingAddress}</Var>, тарафҳо
                уҳдадор шуданд, ки бо шартҳои манфиати мутақобила ҳамкорӣ намоянд.
              </Clause>
              <Clause n="2.2">«Фурӯшанда» имконият медиҳад, ки «Харидор» дар маблағгузории иншооти мазкур
                ширкат намуда, ҳуҷраи истиқоматии <Var>№{aptNo}</Var>-ро, ки нишондиҳандаҳои он
                (ошёна, шумораи ҳуҷраҳо, масоҳат ва нарх барои 1 м²) дар «Маълумоти аҳд»-и боло
                оварда шудаанд, ба моликияти худ ба расмият дарорад. «Харидор» уҳдадор мешавад, ки
                маблағи умумии дар «Маълумоти аҳд» нишондодашударо ({amountWords}) дар муҳлати
                пешбининамудаи шартномаи мазкур пардохт намуда, минбаъд онро ба моликияти шахсии
                худ табдил диҳад.
              </Clause>
              <Clause n="2.3">«Фурӯшанда» бо анҷом расидани корҳои сохтмонӣ ва супоридани иншоот ба
                «Харидор» масоҳати зикршударо, ки дар банди 2.2-и шартномаи мазкур нишон дода
                шудааст, месупорад.
              </Clause>
              <Clause n="2.4">«Харидор» аз лаҳзаи бастани шартномаи ҳамкорӣ талаботи дар банди 2.2-и
                шартномаи мазкур нишон додашударо таъмин менамояд.
              </Clause>
            </>
          )}

          <Section num={3} title="Уҳдадориҳои тарафҳо" />
          {isRent ? (
            <>
              <Clause n="3.1">«АРЕНДОДАТЕЛЬ» уҳдадор мешавад ҳуҷраро (хонаро) дар ҳолати барои истифода
                мувофиқ ба «АРЕНДАТОР» супорад.
              </Clause>
              <Clause n="3.2">«АРЕНДАТОР» уҳдадор мешавад ҳуҷраро (хонаро) тибқи таъиноти он истифода
                барад, ҳолати онро нигоҳ дорад ва хароҷоти ҷории истифодабарӣ (обу барқ ва
                монанди инҳо, агар дар шартнома тартиби дигар пешбинӣ нашуда бошад)-ро
                мустақилона пардохт намояд.
              </Clause>
              <Clause n="3.3">Бе розигии хаттии «АРЕНДОДАТЕЛЬ» «АРЕНДАТОР» ҳуқуқи ба зерижора додани
                ҳуҷраро (хонаро) ба шахси сеюм надорад.
              </Clause>
            </>
          ) : (
            <>
              <Clause n="3.1">«Фурӯшанда» уҳдадор мешавад ба «Харидор» барои ба расмият даровардани
                манзили истиқоматӣ ба моликияти шахсӣ шиносномаи техникӣ диҳад, ки он баъди
                қабули иншоот ба баҳрабардорӣ дода мешавад.
              </Clause>
              <Clause n="3.2">Тамоми хароҷоти вобаста ба ҳуҷҷатгузории нотариалӣ ва бақайдгирии давлатӣ,
                аз рӯи нархномаи КДФБММГ ва нотариуси давлатӣ, мустақилона аз ҷониби «Харидор»
                пардохт карда мешавад.
              </Clause>
            </>
          )}

          <Section num={4} title="Масъулияти тарафҳо" />
          {isRent ? (
            <>
              <Clause n="4.1">«АРЕНДАТОР» барои саривақт пардохт намудани маблағи иҷора масъул мебошад.
              </Clause>
              <Clause n="4.2">«АРЕНДОДАТЕЛЬ» барои пешниҳод намудани ҳуҷра (хона) дар ҳолати барои
                истифода мувофиқ, дар мӯҳлати банди 2.1-и шартномаи мазкур масъул мебошад.
              </Clause>
              <Clause n="4.3">«АРЕНДАТОР» барои зараре, ки аз ҷониби худи ӯ ба ҳуҷра (хона) расонида
                мешавад, ба ғайр аз кӯҳнашавии табиӣ, масъул мебошад.
              </Clause>
            </>
          ) : (
            <>
              <Clause n="4.1">«Харидор» барои саривақт пардохт намудани маблағи шартнома дар банди 2.2
                шартномаи мазкур нишондодашуда масъул мебошад.
              </Clause>
              <Clause n="4.2">«Фурӯшанда» барои саривақт ва босифат иҷро намудани корҳои сохтмонӣ –
                васлкунии иншоот масъул мебошад.
              </Clause>
            </>
          )}

          <Section num={5} title="Чораҳои ҷаримавӣ" />
          {isRent ? (
            <Clause n="5.1">Дар мавриди риоя накардани муҳлати пардохти иҷора зиёда аз 10 рӯз, ба
              андозаи 0,1% аз маблағи иҷораи як моҳ барои ҳар як рӯзи ба таъхирандозӣ, на
              зиёда аз 10%, «АРЕНДАТОР» ба «АРЕНДОДАТЕЛЬ» ҷарима пардохт менамояд.
            </Clause>
          ) : (
            <>
              <Clause n="5.1">Дар мавриди риоя накардани муҳлати пардохт зиёда аз як моҳ ба андозаи 0,1%
                аз маблағи умумии шартнома барои ҳар як рӯзи ба таъхирандозӣ, на зиёда аз 10%,
                «Харидор» ба «Фурӯшанда» ҷарима пардохт менамояд.
              </Clause>
              <Clause n="5.2">Дар ҳолате ки «Харидор» пас аз анҷоми сохтмони бинои истиқоматии бисёрошёна
                аз ҳуҷраи истиқоматии дар банди 2.2 шартномаи мазкур муқарраргардида даст кашад
                (рад намояд), маблағи аз ҷониби ӯ пардохтшуда бо ситонидани ҷарима ба андозаи
                10%-и маблағи умумии дар шартнома зикршуда дар давоми 6 (шаш) моҳ ба «Харидор»
                баргардонида мешавад.
              </Clause>
            </>
          )}

          <Section num={6} title="Ҳолатҳои бекор намудани шартнома" />
          {isRent ? (
            <>
              <Clause n="6.1">Шартнома тибқи мувофиқаи тарафайн, инчунин бо хоҳиши яктарафаи ҳар кадом
                тараф бо огоҳонии дигар тараф на камтар аз 30 рӯз пеш, бекор карда шуда
                метавонад.
              </Clause>
              <Clause n="6.2">Дар сурати аз ҷониби «АРЕНДАТОР» 2 (ду) моҳ пай дар пай пардохт накардани
                маблағи иҷора, «АРЕНДОДАТЕЛЬ» метавонад шартномаро якҷониба бекор намуда,
                ҳуҷраро (хонаро) ба иҷорагири дигар супорад.
              </Clause>
              <Clause n="6.3">Баъди анҷоми мӯҳлати шартнома «АРЕНДАТОР» уҳдадор аст ҳуҷраро (хонаро) дар
                ҳолати аслии он, бо назардошти кӯҳнашавии табиӣ, ба «АРЕНДОДАТЕЛЬ» баргардонад.
              </Clause>
            </>
          ) : (
            <>
              <Clause n="6.1">Шартнома тибқи мувофиқаи тарафайн то пардохт намудан ва ё бо тартиби
                яктарафа дар мавриди қобилияти имконнопазир рад намуда, «Харидор» изҳори
                боздошти пардохт беш аз як моҳ аз муҳлати пардохт метавон бекор кард.
              </Clause>
              <Clause n="6.2">Дар сурати 2 (ду) моҳ пардохт накардани маблағ аз тарафи «Харидор», онгоҳ
                «Фурӯшанда» метавонад дигар муштариро барои ҳуҷраи дар банди 2.2 шартномаи мазкур
                аз нав бандад.
              </Clause>
            </>
          )}

          <Section num={7} title="Форс-мажор" />
          <Clause n="7.1">Ягон тараф масъулиятро барои иҷро накардан ва иҷрои номатлуби уҳдадориҳои
            худ нахоҳад бурд, агар иҷрои номатлуб дар ҳолати қувваи рафънопазир номумкин
            гашта бошад, яъне ҳолатҳои фавқулода, ки онҳо баъди бастани Шартномаҳои мазкур ба
            вуҷуд омаданд. Ба чунин ҳолатҳо дохил мешавад: сӯхтор, обхезӣ, заминҷунбӣ ва
            дигар офатҳои табиӣ, ки уҳдадориҳои тарафҳоро номумкин мегардонад.
          </Clause>
          <Clause n="7.2">Агар ҳамагуна аз ҳолатҳои мазкур бевосита барои иҷрои уҳдадориҳо ба
            муҳлате, ки дар шартномаи мазкур дарҷ шудааст, таъсир расонида, муҳлати мазкур ба
            вақти амалии ҳолати дахлдор дароз карда мешавад.
          </Clause>

          <Section num={8} title="Ҳалли баҳсҳо" />
          <Clause n="8.1">Баҳсҳои зимни амалисозии шартномаи мазкур рухдиҳандаро метавон бо роҳи
            гуфтушунид ҳал намуд. Дар мавриди бо гуфтушунид ҳал нагардидани баҳс, он дар
            асоси Қонунҳои амалкунандаи Ҷумҳурии Тоҷикистон дар Суди иқтисодии шаҳри{" "}
            {companyCity} ҳаллу фасл карда мешавад.
          </Clause>
          <Clause n="8.2">Шартномаи мазкур аз лаҳзаи ба имзо расонидани ҳар ду тараф эътибор пайдо
            менамояд.
          </Clause>
          <Clause n="8.3">
            {isRent
              ? "Шартномаи мазкур дар ду нусха бо забони тоҷикӣ барои ҳар кадом тарафҳо тартиб дода шудааст ва эътибор ва ҳуқуқи якхела дорад."
              : "Ба Шартномаи мазкур номгӯи намуди корҳои иҷронамудаи «Фурӯшанда» замима гардида, қисми ҷудонопазири шартнома ба шумор рафта, шартнома дар ду нусха бо забони тоҷикӣ барои ҳар кадом тарафҳо тартиб дода шудааст ва эътибор ва ҳуқуқи якхела дорад."}
          </Clause>

          <Section num={9} title="Суроғаи ҳуқуқӣ ва имзои тарафҳо" />

          {/* Two party blocks. The seller's is the company's fixed identity
              (settings); the buyer's is the part that differs on every
              contract, so it gets the filled-field treatment.

              break-inside-avoid on the row AND on each block (inside
              Party): the pair moves together as one unit, and neither
              block's own rule/signature line can be split from its text by
              a page boundary. #contract-print-area's own print rules
              (globals.css) only cover <section> and <table>, and this is
              neither. */}
          <div className="mt-1.5 grid grid-cols-2 gap-9 break-inside-avoid text-[11px] leading-[1.5]">
            <Party role={`«${sellerLabelUpper}»`} stamp date={shortDate(contract.signed_date)}>
              <div>Роҳбари ҶДММ «{companyName}»</div>
              <div className="text-[12.5px] font-bold">{director}</div>
              {settings.company_address && (
                <div className="text-slate-700">{settings.company_address}</div>
              )}
              {settings.company_bank_details && (
                <div className="whitespace-pre-line text-slate-700">
                  {settings.company_bank_details}
                </div>
              )}
            </Party>

            <Party role={`«${buyerLabelUpper}»`} date={shortDate(contract.signed_date)}>
              <div className="text-[12.5px]">
                <Var>{contract.client?.name ?? "____________"}</Var>
              </div>
              {contract.client?.passport && (
                <div className="text-slate-700">Шиноснома: {contract.client.passport}</div>
              )}
              {contract.client?.passport_issued_by && (
                <div className="text-slate-700">
                  Дода шудааст: {contract.client.passport_issued_by}
                </div>
              )}
              {contract.client?.address && (
                <div className="text-slate-700">{contract.client.address}</div>
              )}
              {contract.client?.phone && (
                <div className="text-slate-700">Тел: {contract.client.phone}</div>
              )}
            </Party>
          </div>
        </div>
      </div>

        {/* ЗАМИМА is the list of CONSTRUCTION works completed on a new
            building being sold -- meaningless for a lease of already-
            existing space, so it's skipped entirely for isRent rather than
            relabelled the way the sections above are. Forces its own fresh
            page (print:break-before-page), matching the original Word
            document: a page that carried Section 9's signatures AND
            ЗАМИМА's own signature pair together would look like two
            separate signing points crammed onto one sheet. print:block
            because this can run past one page on its own, and a flex
            container doesn't paginate that overflow cleanly. */}
        {!isRent && (
        <div className="relative print:min-h-screen">
          {watermark}
        <div className="flex flex-col gap-1.5 px-9 pb-8 pt-7 print:break-before-page print:block">
          <DocTitle kicker={`Замима ба шартномаи №${contract.number || "____"}`} title="ЗАМИМА" />
          <p className="mt-1.5 text-[12.5px] font-bold">
            Номгӯи корҳои иҷрошаванда ва масолеҳҳои истифодашаванда
          </p>
          {/* Full text width, matching the rest of the document. */}
          <p className="text-justify">
            Корҳои сохтмонию васлкунии ба анҷом расонидашуда ва иншооти мазкур барои
            баҳрабардорӣ ва расмиятдарорӣ бо моликият пас аз анҷоми корҳои зайл омода
            ҳисобида мешаванд:
          </p>
          {/* A smeta-style table: rules carry the structure (accent rule
              over the header and under the last row, a rule under each
              category label, a hairline between items), no fills and no
              zebra -- background tints are dropped when printing anyway.
              Item numbers hang in the left column like the clause numbers
              in the body. break-inside-avoid keeps the whole table from
              splitting across the page boundary if it ever runs close to
              the edge. */}
          <div className="mt-1.5 break-inside-avoid">
            <table className="w-full border-collapse text-[10.5px]">
              <thead>
                <tr>
                  <th
                    style={{ borderTop: `1.5px solid ${ACCENT}`, borderBottom: `0.75px solid ${ACCENT}` }}
                    className={`w-8 py-1 text-left ${LABEL}`}
                  >
                    №
                  </th>
                  <th
                    style={{ borderTop: `1.5px solid ${ACCENT}`, borderBottom: `0.75px solid ${ACCENT}` }}
                    className={`py-1 text-left ${LABEL}`}
                  >
                    Номгӯи корҳо
                  </th>
                </tr>
              </thead>
              <tbody>
                {worksRows.map((row) =>
                  row.kind === "cat" ? (
                    <tr key={row.key}>
                      <td
                        colSpan={2}
                        style={{ color: ACCENT, borderBottom: `0.75px solid ${HAIR}` }}
                        className="pb-0.5 pt-2 text-[9px] font-bold uppercase tracking-[0.1em]"
                      >
                        {row.label}
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.key}>
                      <td
                        style={{ color: ACCENT, borderBottom: `0.5px solid ${HAIR}` }}
                        className="py-1 text-left font-bold tabular-nums"
                      >
                        {row.n}
                      </td>
                      <td style={{ borderBottom: `0.5px solid ${HAIR}` }} className="py-1 text-left">
                        {row.text}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <div aria-hidden="true" style={{ borderTop: `1.5px solid ${ACCENT}` }} />
          </div>

          {/* Both blocks stretch to equal height (grid's own align-items)
              and Party pushes its signature line to the bottom with mt-auto,
              so the two "имзо" lines sit level even though the seller's
              block carries one more line of text than the buyer's. */}
          <div className="mt-8 grid grid-cols-2 gap-9 break-inside-avoid text-[11.5px] leading-[1.5]">
            <Party role="«Фурӯшанда»" stamp>
              <div>Роҳбари ҶДММ «{companyName}»</div>
              <div className="font-bold">{director}</div>
            </Party>
            <Party role="«Харидор»">
              <div>
                <Var>{contract.client?.name ?? "____________"}</Var>
              </div>
            </Party>
          </div>
        </div>
        </div>
        )}

        {/* Payment schedule -- only when the deal actually has one, and the
            LAST thing in the document, after ЗАМИМА, rather than a table
            wedged into the body between clause 8.3 and the signatures.
            print:break-before-page for the same reason ЗАМИМА carries one:
            ЗАМИМА's own content doesn't reliably fill its page, so without
            a forced break here the table just continues wherever ЗАМИМА
            happened to end -- an annex sharing a page with an unrelated
            table. globals.css also keeps the <table> itself from splitting
            mid-row (page-break-inside: avoid); print:block is what lets it
            spill onto a FOLLOWING page cleanly if it runs past one. */}
        {(contract.payment_type === "installment" || isRent) && payments.length > 0 && (
        <div className="relative print:min-h-screen">
          {watermark}
          <div className="flex flex-col gap-1.5 px-9 pb-8 pt-7 print:break-before-page print:block">
            <DocTitle
              kicker={`Замима ба шартномаи №${contract.number || "____"}`}
              title="ҶАДВАЛИ ПАРДОХТҲО"
            />
            {/* Same rule-based marking as the ЗАМИМА table: tabular numbers
                so № and Маблағ line up in their columns, a bold (not
                coloured) date for a still-open row that's already past its
                due date, and a heavier rule over the total row. */}
            <p className="mt-1.5">
              Пардохтшуда: <b>{docAmount(paidSoFar, contract.currency)}</b>; боқимонда:{" "}
              <b>{docAmount(remainingSchedule, contract.currency)}</b>
              {unpaidRows.length > 0 && typicalMonthly != null && (
                <>
                  {" "}
                  дар <b>{unpaidRows.length}</b> қисм, ҳар моҳ тақрибан{" "}
                  <b>{docAmount(typicalMonthly, contract.currency)}</b>
                </>
              )}
              .
            </p>
            <div className="mt-1">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr
                    style={{ borderTop: `1.5px solid ${ACCENT}`, borderBottom: `0.75px solid ${ACCENT}` }}
                    className="text-left"
                  >
                    <th className={`px-2 py-1 text-center ${LABEL}`}>№</th>
                    <th className={`px-2 py-1 ${LABEL}`}>Сана</th>
                    <th className={`px-2 py-1 text-right ${LABEL}`}>Маблағ</th>
                    <th className={`whitespace-nowrap px-2 py-1 text-center ${LABEL}`}>
                      Пардохт шуд
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => {
                    const overdue = !p.paid && new Date(p.due_date) < new Date();
                    return (
                      <tr key={p.id} style={{ borderBottom: `0.5px solid ${HAIR}` }}>
                        <td style={{ color: ACCENT }} className="px-2 py-1 text-center font-bold tabular-nums">
                          {i + 1}
                        </td>
                        <td className={`px-2 py-1 ${overdue ? "font-bold" : ""}`}>
                          {shortDate(p.due_date)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {docAmount(p.amount, contract.currency)}
                        </td>
                        <td className="px-2 py-1 text-center">
                          {p.paid ? <span className="font-bold">✓</span> : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr
                    style={{ borderTop: `1.5px solid ${ACCENT}`, borderBottom: `1.5px solid ${ACCENT}` }}
                    className="font-bold"
                  >
                    <td className="px-2 py-1" />
                    <td className="px-2 py-1">Ҷамъ</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {docAmount(scheduleTotal, contract.currency)}
                    </td>
                    <td className="px-2 py-1" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}
    </div>
  );
}
