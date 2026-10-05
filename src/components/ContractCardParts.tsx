"use client";

import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatArea } from "@/lib/objects/format";
import { formatShortDate } from "@/lib/formatDate";
import { documentFont } from "@/lib/documentFont";
import {
  CalendarIcon,
  DocumentIcon,
  HomeIcon,
  MoneyIcon,
  ReceiptIcon,
} from "@/components/icons";
import type { PaymentType } from "@/lib/contracts/types";

// The left half of a contract row on the client page: which flat this is.
//
// The flat number is what a person looks for in this list, so it gets a badge
// of its own -- dark with a yellow numeral -- instead of being the tail of a
// comma-separated sentence. Entrance and floor follow as chips.
export function ContractCardHead({
  object,
  apartmentNumber,
  buildingName,
  contractNumber,
  paidCount,
  t,
}: {
  object: {
    name: string | null;
    block: string | null;
    floor: number | null;
    area: number | null;
  } | null;
  apartmentNumber: number | undefined;
  buildingName: string | null;
  contractNumber: string | null;
  paidCount: number;
  t: Dictionary;
}) {
  const chip =
    "rounded-md bg-[var(--hover-c2)] px-1.5 py-0.5 text-xs font-semibold text-[var(--ink-2)]";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-12 min-w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-[#18181b] px-2 text-[var(--accent-yellow)] shadow-sm dark:bg-[var(--accent-yellow)] dark:text-[#18181b]"
      >
        {apartmentNumber != null ? (
          <>
            <span className="text-[9px] font-semibold uppercase leading-none tracking-wider opacity-80">
              {t.clients.purchases.flatShort}
            </span>
            <span
              style={documentFont.style}
              className="mt-0.5 text-[20px] font-bold leading-none tabular-nums"
            >
              {apartmentNumber}
            </span>
          </>
        ) : (
          <HomeIcon className="h-5 w-5" />
        )}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold leading-tight text-[var(--ink-1)]">
          {object?.block && <span>{object.block}</span>}
          {object?.floor != null && (
            <span className={chip}>{t.buildings.unitFloor.replace("{n}", String(object.floor))}</span>
          )}
          {object?.area != null && <span className={chip}>{formatArea(object.area)}</span>}
          {object && !object.block && object.floor == null && <span>{object.name || "—"}</span>}
          {!object && <span>—</span>}
        </p>
        <p className="mt-0.5 truncate text-xs text-[var(--ink-5)]">
          {[buildingName, contractNumber ? `№${contractNumber}` : null].filter(Boolean).join(" · ")}
          {paidCount > 0 && ` · ${paidCount} ${t.clients.purchases.paymentsCount.toLowerCase()}`}
        </p>
      </div>
    </div>
  );
}

// Contract particulars as a row of compact facts -- number, how it is paid,
// signing date -- each with its own icon, instead of a bordered spreadsheet
// grid. (The apartment's catalogue price is deliberately not here: it is a
// different number from the contract amount whenever a discount was agreed, and
// beside these it read as the two figures disagreeing. The tag icon on the card
// opens it for editing.)
export function ContractFacts({
  number,
  paymentType,
  installmentMonths,
  signedDate,
  notes,
  t,
}: {
  number: string | null;
  paymentType: PaymentType;
  installmentMonths: number | null;
  signedDate: string | null;
  notes: string | null;
  t: Dictionary;
}) {
  const facts = [
    { icon: <ReceiptIcon />, label: t.contracts.form.number, value: number || "—" },
    {
      icon: <MoneyIcon />,
      label: t.contracts.form.paymentType,
      value:
        t.contracts.paymentTypes[paymentType] +
        (paymentType === "installment" && installmentMonths
          ? ` · ${installmentMonths} ${t.contracts.form.monthsShort}`
          : ""),
    },
    { icon: <CalendarIcon />, label: t.contracts.form.signedDate, value: formatShortDate(signedDate) },
  ];
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {facts.map((f) => (
        <div
          key={f.label}
          className="flex min-w-0 items-center gap-2.5 rounded-lg border border-[var(--border-c)] bg-[var(--surface-1)] py-2 pl-2 pr-3.5"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--hover-c2)] text-[var(--ink-3)] [&_svg]:h-[17px] [&_svg]:w-[17px]">
            {f.icon}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-5)]">
              {f.label}
            </p>
            <p className="truncate text-[13px] font-semibold text-[var(--ink-1)]">{f.value}</p>
          </div>
        </div>
      ))}
      {notes && (
        <div className="flex basis-full items-start gap-2.5 rounded-lg border border-[var(--wash-amber-border)] bg-[var(--wash-amber)] px-3 py-2 text-[13px] text-[var(--wash-amber-ink)]">
          <DocumentIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
              {t.contracts.form.notes}
            </p>
            <p className="whitespace-pre-line">{notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}
