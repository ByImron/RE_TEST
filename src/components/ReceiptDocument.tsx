"use client";

import type { Currency } from "@/lib/currency";
import { formatShortDate } from "@/lib/formatDate";
import { amountToWordsTj } from "@/lib/contracts/amountToWordsTj";
import { CURRENCY_WORD } from "@/lib/contracts/currencyWord";
import { bareCompanyName } from "@/lib/settings/companyName";
import { documentFont } from "@/lib/documentFont";
import type { Settings } from "@/lib/settings/types";
import type { ContractPayment } from "@/lib/contracts/types";

export type ReceiptContractData = {
  number: string | null;
  amount: number;
  paid_amount: number;
  currency: Currency;
  client: { name: string } | null;
  object: { name: string; area: number | null; floor: number | null; block: string | null } | null;
};

// Near-black ink and the Лимӯ yellow (--accent-yellow) -- the site's own
// palette, the same one the sign-in screen uses.
//
// Printing: browsers drop background colours unless told otherwise, and this
// receipt deliberately has a few filled shapes (the black spine, the yellow
// amount box, the debt strip). Those carry `print-color-adjust: exact`, which
// makes the browser paint them anyway -- no "background graphics" tick needed.
// Everything that must stay readable on a black-and-white printer is dark text
// (yellow is only ever a FILL behind dark text, never the text), and structure
// is also carried by borders, which always print.
const INK = "#18181b";
const HAIR = "#cbd0d6";
const PRINT_EXACT = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;
const FONT = documentFont.style;
const LABEL = "text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-500";

// 45 000 сомонӣ -- thousands grouped with a non-breaking space so a sum never
// splits across lines, decimal comma only when there are kopecks.
function money(value: number, currency: Currency): string {
  const [int, frac] = Math.abs(value).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const num = frac === "00" ? grouped : `${grouped},${frac}`;
  return `${value < 0 ? "−" : ""}${num} ${CURRENCY_WORD[currency]}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#cbd0d6] py-2 last:border-b-0">
      <dt className="text-[13px] text-slate-500">{label}</dt>
      <dd className="text-right text-[13px] font-bold tabular-nums">{value}</dd>
    </div>
  );
}

// A payment receipt drawn as a ticket: a black spine down the left edge
// carrying "РАСИД № …" (what a real ticket repeats on its stub), punched by
// two half-circle notches where the stub would tear off, then the receipt
// itself -- company, number and date, payer, the deal's figures, the amount in
// a yellow box, the remaining debt (red) or the "paid in full" line (green),
// and two signature lines.
//
// Printed twice per A4 sheet (buyer copy / company copy) by the receipt
// page. Document text is fixed Tajik (official language), independent of
// the UI locale -- same policy as the contract.
export function ReceiptDocument({
  settings,
  contract,
  payment,
  receiptNo,
  copyLabel,
  apartmentNumber,
}: {
  settings: Settings;
  contract: ReceiptContractData;
  payment: ContractPayment;
  receiptNo: number | null;
  copyLabel: string;
  apartmentNumber?: number;
}) {
  const companyName = bareCompanyName(settings.company_name) || "—";
  const remaining = Math.max(contract.amount - contract.paid_amount, 0);
  const dateStr = payment.paid_date ?? payment.due_date;

  // A client can be buying several apartments at once, and receipt numbers
  // run per contract -- so a bare "№1" would appear once per apartment and
  // two different receipts could carry the same number. Prefixing with the
  // contract number keeps every printed receipt unique and traceable back
  // to its apartment.
  const receiptLabel =
    receiptNo == null
      ? "—"
      : contract.number
        ? `${contract.number}/${receiptNo}`
        : String(receiptNo);

  // Order matches how the company reads a unit out loud: which entrance,
  // which floor, how big, and only then the apartment number -- not the
  // internal grid name.
  const unitLine = [
    contract.object?.block,
    contract.object?.floor != null ? `${contract.object.floor}-ошёна` : null,
    contract.object?.area != null ? `${contract.object.area.toFixed(2).replace(".", ",")} м²` : null,
    apartmentNumber != null ? `Хонаи №${apartmentNumber}` : (contract.object?.name ?? null),
  ]
    .filter(Boolean)
    .join(" · ");

  // Where the page behind the ticket shows through the notches: white on
  // paper, the app's own background on screen.
  const NOTCH = "absolute h-5 w-5 rounded-full bg-[var(--surface-0)] print:bg-white";

  return (
    <div
      style={FONT}
      className="relative flex overflow-hidden rounded-2xl border border-slate-200 bg-white text-[13px] leading-[1.5] text-[#18181b] shadow-sm print:break-inside-avoid print:rounded-none print:border-0 print:shadow-none"
    >
      {/* Watermark: the washed-out company logo, as on the contract. An <img>,
          not a CSS background -- images always print. */}
      {settings.company_logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={settings.company_logo_url}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 w-[52%] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.1]"
        />
      )}

      {/* The spine. */}
      <div
        style={{ ...PRINT_EXACT, backgroundColor: INK, borderRight: "3px solid var(--accent-yellow)" }}
        className="relative flex w-10 shrink-0 items-center justify-center py-4"
      >
        <span
          style={{ writingMode: "vertical-rl" }}
          className="rotate-180 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.22em] text-white"
        >
          РАСИД № {receiptLabel}
        </span>
      </div>

      {/* Tear-off notches, centred on the spine's edge. */}
      <span
        aria-hidden="true"
        style={{ ...PRINT_EXACT, left: "calc(2.5rem - 0.625rem)", top: "-0.625rem" }}
        className={NOTCH}
      />
      <span
        aria-hidden="true"
        style={{ ...PRINT_EXACT, left: "calc(2.5rem - 0.625rem)", bottom: "-0.625rem" }}
        className={NOTCH}
      />

      <div className="relative flex min-w-0 flex-1 flex-col gap-3 px-5 pb-4 pt-4">
        {/* Company + which copy this is. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {settings.company_logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.company_logo_url}
                alt=""
                className="h-7 w-7 shrink-0 object-contain"
              />
            )}
            <p className="truncate text-[12px] font-bold">ҶДММ «{companyName}»</p>
          </div>
          <span
            style={{ border: `1px solid ${HAIR}` }}
            className="shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-600"
          >
            {copyLabel}
          </span>
        </div>

        {/* Number and date. */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className={LABEL}>Расид</p>
            <p className="text-[22px] font-bold leading-tight tabular-nums">№ {receiptLabel}</p>
          </div>
          <div className="text-right">
            <p className={LABEL}>Сана</p>
            <p className="text-[16px] font-bold leading-tight tabular-nums">
              {formatShortDate(dateStr)}
            </p>
          </div>
        </div>

        {/* Payer. */}
        <div>
          <p className="text-[19px] font-bold leading-tight">{contract.client?.name ?? "—"}</p>
          {unitLine && <p className="mt-0.5 text-[12px] text-slate-500">{unitLine}</p>}
        </div>

        <dl>
          <Row label="Рақами шартнома" value={contract.number ? `№${contract.number}` : "—"} />
          <Row label="Нархи умумӣ" value={money(contract.amount, contract.currency)} />
          <Row
            label="Ҳолат"
            value={payment.paid ? "тасдиқ шудааст" : "ҳанӯз тасдиқ нашудааст"}
          />
        </dl>

        {/* Amount: the one big figure, in a yellow box. Dark text on the
            fill, so a black-and-white printer turns it into black on light
            grey rather than losing it. */}
        <div style={{ borderTop: `1px solid ${HAIR}` }} className="flex items-center gap-3 pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold">Маблағи пардохт</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              {amountToWordsTj(payment.amount, contract.currency)}
            </p>
          </div>
          <p
            style={{ ...PRINT_EXACT, backgroundColor: "var(--accent-yellow)" }}
            className="shrink-0 rounded-lg px-3 py-1.5 text-[22px] font-bold leading-none tabular-nums"
          >
            {money(payment.amount, contract.currency)}
          </p>
        </div>

        {/* Balance. Red while there is debt left, green once it is settled --
            both dark enough to read in grey-scale, and the border says the same
            thing where a fill is not printed. */}
        {remaining > 0 ? (
          <div
            style={{ ...PRINT_EXACT, backgroundColor: "#fef2f2", border: "1px solid #fca5a5" }}
            className="rounded-lg px-3 py-2 text-center text-[14px] font-bold tabular-nums text-red-700"
          >
            Боқимонда: {money(remaining, contract.currency)}
          </div>
        ) : (
          <div
            style={{ ...PRINT_EXACT, backgroundColor: "#ecfdf5", border: "1px solid #6ee7b7" }}
            className="rounded-lg px-3 py-2 text-center text-[14px] font-bold text-emerald-800"
          >
            ✓ Пурра пардохт шуд
          </div>
        )}

        {/* Signatures: a drawn line each, caption below. */}
        <div className="mt-1 grid grid-cols-2 gap-6">
          {[
            { role: "Намояндаи Фурӯшанда", caption: "имзо / М. П." },
            { role: "Харидор", caption: "имзо" },
          ].map((s) => (
            <div key={s.role}>
              <p className={LABEL}>{s.role}</p>
              <div className="mt-5" style={{ borderTop: `1px solid ${INK}` }} />
              <p className="mt-0.5 text-[9px] text-slate-500">{s.caption}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
