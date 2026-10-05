"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAccess } from "@/lib/auth/useRole";
import { WalletIcon } from "@/components/icons";
import { CURRENCIES } from "@/lib/currency";
import type { FinanceOverview } from "@/lib/finance/types";
import { Money, toneFor } from "@/components/finance/FinanceParts";

// What one building has taken in and spent, on the building's own page: sales
// receipts against expenses, the result, and what a square metre has cost so
// far. Whoever may open Finance sees it; everyone else does not even query.
export function BuildingFinanceCard({
  buildingId,
  totalArea,
}: {
  buildingId: string;
  /** Sum of the building's unit areas, m² -- for "cost per m²". */
  totalArea: number;
}) {
  const { t } = useLocale();
  const { canViewFinance: allowed } = useAccess();
  const [data, setData] = useState<FinanceOverview | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    createClient()
      .schema("crm")
      .rpc("finance_overview", { p_building_id: buildingId })
      .then(({ data: result, error }) => {
        if (cancelled) return;
        if (error) console.error("finance_overview failed:", error.message);
        else setData(result as FinanceOverview);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, buildingId]);

  if (!allowed || !data) return null;

  const rows = CURRENCIES.map((currency) => {
    const totals = data.totals.find((row) => row.currency === currency);
    return totals ? { currency, income: totals.income, expense: totals.expense } : null;
  }).filter((row) => row !== null);

  return (
    <section className="rounded-2xl border border-[var(--border-c)] bg-[var(--surface-1)] shadow-sm">
      <header className="flex items-center gap-3 border-b border-[var(--border-c2)] px-5 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#18181b] text-[var(--accent-yellow)] dark:bg-[var(--accent-yellow)] dark:text-[#18181b] [&_svg]:h-[17px] [&_svg]:w-[17px]">
          <WalletIcon />
        </span>
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold text-[var(--ink-1)]">{t.finance.title}</h2>
        <Link
          href={`/finance?building=${buildingId}`}
          className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--ink-3)] underline underline-offset-4 transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
        >
          {t.finance.buildingCard.open}
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--ink-4)]">{t.finance.buildingCard.empty}</p>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--border-c2)]">
          {rows.map((row) => {
            const net = row.income - row.expense;
            return (
              <div key={row.currency} className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-4">
                <Figure label={t.finance.income} tone="text-[var(--wash-emerald-ink)]">
                  <Money value={row.income} currency={row.currency} />
                </Figure>
                <Figure label={t.finance.expense} tone="text-[var(--wash-rose-ink)]">
                  <Money value={row.expense} currency={row.currency} />
                </Figure>
                <Figure label={t.finance.result} tone={toneFor(net)}>
                  <Money value={net} currency={row.currency} signed />
                </Figure>
                <Figure label={t.finance.buildingCard.perSqm} tone="text-[var(--ink-2)]">
                  {totalArea > 0 && row.expense > 0 ? (
                    <Money value={Math.round(row.expense / totalArea)} currency={row.currency} />
                  ) : (
                    "—"
                  )}
                </Figure>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Figure({
  label,
  tone,
  children,
}: {
  label: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">{label}</p>
      <p className={`mt-0.5 text-lg font-bold leading-tight ${tone}`}>{children}</p>
    </div>
  );
}
