"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAccess } from "@/lib/auth/useRole";
import { SetupNotice } from "@/components/SetupNotice";
import { ListToolbar } from "@/components/ActionBar";
import { PlusIcon, WalletIcon } from "@/components/icons";
import { HBarChart, type HBarDatum } from "@/components/charts/HBarChart";
import { CHART_HUES, compactNumber } from "@/components/charts/palette";
import { CURRENCIES, type Currency } from "@/lib/currency";
import { localISO, monthStartOffset } from "@/lib/finance/period";
import { categoryLabel, type CashBalance, type FinanceOverview } from "@/lib/finance/types";
import { useFinance } from "@/components/finance/FinanceContext";
import { ReconcileCard } from "@/components/finance/ReconcileCard";
import { Money, MonthBars, toneFor } from "@/components/finance/FinanceParts";
import { FinanceFilter, useCommonFilterState } from "@/components/finance/FinanceToolbarParts";

// Expenses are red throughout, the same red as the expense bars and dots --
// a ranking of categories does not need a colour per row.
const EXPENSE_HUE = CHART_HUES[3];
const MAX_MONTHS = 12;

const CARD = "rounded-2xl border border-[var(--border-c)] bg-[var(--surface-1)] shadow-sm";

export default function FinanceOverviewPage() {
  const { t } = useLocale();
  const { canViewSales } = useAccess();
  const configured = isSupabaseConfigured();
  const { range, buildingId, canManage, version, setupMissing, openEntry } = useFinance();
  const filters = useCommonFilterState();

  const [data, setData] = useState<FinanceOverview | null>(null);
  const [trend, setTrend] = useState<FinanceOverview["by_month"]>([]);
  const [cash, setCash] = useState<CashBalance[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const queryKey = [range.from, range.to, buildingId, version].join("|");
  const loading = configured && !setupMissing && loadedKey !== queryKey;

  useEffect(() => {
    if (!configured || setupMissing) return;
    let cancelled = false;
    createClient()
      .schema("crm")
      .rpc("finance_overview", {
        p_from: range.from,
        p_to: range.to,
        p_building_id: buildingId !== "all" && buildingId !== "none" ? buildingId : null,
        p_company_only: buildingId === "none",
      })
      .then(({ data: result, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("finance_overview failed:", error.message);
          setFailure(error.message);
          setData(null);
        } else {
          setFailure(null);
          setData(result as FinanceOverview);
        }
        setLoadedKey(queryKey);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, setupMissing, range.from, range.to, buildingId, queryKey]);

  // The monthly chart is a trend, so it ignores the period pills: it always
  // shows the twelve months ending where the period ends (or today), for the
  // same building. Otherwise "This month" would draw one lonely pair of bars.
  const trendEnd = range.to ?? localISO(new Date());
  useEffect(() => {
    if (!configured || setupMissing) return;
    let cancelled = false;
    const from = localISO(monthStartOffset(trendEnd, -(MAX_MONTHS - 1)));
    createClient()
      .schema("crm")
      .rpc("finance_overview", {
        p_from: from,
        p_to: trendEnd,
        p_building_id: buildingId !== "all" && buildingId !== "none" ? buildingId : null,
        p_company_only: buildingId === "none",
      })
      .then(({ data: result, error }) => {
        if (cancelled) return;
        setTrend(error ? [] : (result as FinanceOverview).by_month);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, setupMissing, trendEnd, buildingId, version]);

  // The cash balance ignores the period and the building on purpose, so it has
  // its own query: it only changes when something is booked.
  useEffect(() => {
    if (!configured || setupMissing) return;
    let cancelled = false;
    createClient()
      .schema("crm")
      .rpc("finance_cash")
      .then(({ data: result, error }) => {
        if (!cancelled) setCash(error ? [] : ((result ?? []) as CashBalance[]));
      });
    return () => {
      cancelled = true;
    };
  }, [configured, setupMissing, version]);

  const currencies = useMemo(
    () => CURRENCIES.filter((c) => data?.totals.some((row) => row.currency === c)),
    [data]
  );

  return (
    <div className="flex flex-col gap-5">
      {!configured && <SetupNotice />}

      <ListToolbar filters={filters.chips} onClearAll={filters.reset} clearLabel={t.common.resetFilters}>
        <FinanceFilter />
      </ListToolbar>

      {failure && (
        <p role="alert" className="rounded-lg bg-[var(--wash-rose)] px-4 py-3 text-sm text-[var(--wash-rose-ink)]">
          {t.finance.loadFailed}
        </p>
      )}

      {loading && !data && <p className="text-[var(--ink-5)]">{t.common.loading}</p>}

      {data && currencies.length === 0 && !loading && (
        <div className={`${CARD} flex flex-col items-center gap-3 px-6 py-12 text-center`}>
          <p className="text-[var(--ink-4)]">{t.finance.overview.empty}</p>
          {canManage && (
            <button type="button" onClick={() => openEntry()} className="btn btn-primary btn-md">
              <PlusIcon className="h-4 w-4" />
              {t.finance.addEntry}
            </button>
          )}
        </div>
      )}

      {data && cash.length > 0 && <BalanceCard cash={cash} />}

      {data &&
        currencies.map((currency) => (
          <CurrencyBlock key={currency} currency={currency} data={data} trend={trend} trendEnd={trendEnd} />
        ))}

      {data && data.by_building.length > 0 && (
        <BuildingTable data={data} linkable={canViewSales} />
      )}

      {data && <ReconcileCard />}

    </div>
  );
}

// How much money there actually is, right now, company-wide -- deliberately
// separate from the three tiles below, which are scoped to the selected
// period and building. This one never is: it is income minus expense since
// the very first entry, ignoring both filters, so it answers a different
// question ("what's in the till today") than "Результат" does ("how did the
// selected period go").
function BalanceCard({ cash }: { cash: CashBalance[] }) {
  const { t } = useLocale();
  return (
    <section
      className={`${CARD} flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent-yellow)_18%,transparent)] text-[var(--accent-yellow)]">
          <WalletIcon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--ink-1)]">{t.finance.balance}</h2>
          <p className="max-w-sm text-xs text-[var(--ink-5)]">{t.finance.balanceHint}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 sm:pl-1">
        {cash.map((row) => (
          <span key={row.currency} className="flex flex-col">
            <span className={`text-[20px] font-bold leading-tight sm:text-[26px] ${toneFor(row.value)}`}>
              <Money value={row.value} currency={row.currency} signed />
            </span>
            {row.on_hand > 0 && (
              <span className="text-xs text-[var(--ink-5)]">
                {t.finance.onHand.replace("{sum}", `${new Intl.NumberFormat("ru-RU").format(row.on_hand)} ${row.currency}`)}
              </span>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}

// Everything for one currency: the three headline numbers, the months, and
// where the expenses went. Currencies never share a block or a scale.
function CurrencyBlock({
  currency,
  data,
  trend,
  trendEnd,
}: {
  currency: Currency;
  data: FinanceOverview;
  trend: FinanceOverview["by_month"];
  trendEnd: string;
}) {
  const { t } = useLocale();
  const totals = data.totals.find((row) => row.currency === currency) ?? {
    income: 0,
    expense: 0,
    entries: 0,
  };
  const net = totals.income - totals.expense;

  // The twelve months ending at `trendEnd`, quiet months as empty slots. Months
  // before the first one with any money are dropped (a company two months into
  // using this should not see ten blank columns), but never fewer than six.
  const months = useMemo(() => {
    const byMonth = new Map(trend.filter((m) => m.currency === currency).map((m) => [m.month, m]));
    const all: Array<{ month: string; income: number; expense: number }> = [];
    for (let i = MAX_MONTHS - 1; i >= 0; i--) {
      const d = monthStartOffset(trendEnd, -i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = byMonth.get(key);
      all.push({ month: key, income: row?.income ?? 0, expense: row?.expense ?? 0 });
    }
    const firstWithData = all.findIndex((m) => m.income > 0 || m.expense > 0);
    if (firstWithData < 0) return [];
    return all.slice(Math.min(firstWithData, MAX_MONTHS - 6));
  }, [trend, trendEnd, currency]);

  const expenseBars: HBarDatum[] = data.by_category
    .filter((c) => c.kind === "expense" && c.currency === currency)
    .map((c) => ({
      label: categoryLabel(c.name ? { name: c.name, code: c.code } : null, t.finance.categories.contractPayments, t.finance.noCategory),
      value: c.total,
      hue: EXPENSE_HUE,
    }));

  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label={t.finance.income} tone="text-[var(--wash-emerald-ink)]" dot="bg-emerald-500">
          <Money value={totals.income} currency={currency} />
        </Tile>
        <Tile label={t.finance.expense} tone="text-[var(--wash-rose-ink)]" dot="bg-rose-500">
          <Money value={totals.expense} currency={currency} />
        </Tile>
        <Tile label={t.finance.result} tone={toneFor(net)} dot="bg-[var(--accent-yellow)]" strong className="col-span-2 sm:col-span-1">
          <Money value={net} currency={currency} signed />
        </Tile>
      </div>

      {totals.entries ? (
        <p className="-mt-1 text-xs text-[var(--ink-5)]">
          {t.finance.overview.operations.replace("{n}", String(totals.entries))}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${CARD} min-w-0 p-5`}>
          <h2 className="mb-4 text-[15px] font-semibold text-[var(--ink-1)]">{t.finance.overview.monthly}</h2>
          {months.length > 0 ? (
            <MonthBars data={months} currency={currency} />
          ) : (
            <p className="text-sm text-[var(--ink-5)]">{t.finance.overview.empty}</p>
          )}
        </div>
        <div className={`${CARD} min-w-0 p-5`}>
          <h2 className="mb-4 text-[15px] font-semibold text-[var(--ink-1)]">{t.finance.overview.expensesByCategory}</h2>
          {expenseBars.length > 0 ? (
            <HBarChart data={expenseBars} formatValue={(n) => `${compactNumber(n)} ${currency}`} />
          ) : (
            <p className="text-sm text-[var(--ink-5)]">{t.finance.overview.noExpenses}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Tile({
  label,
  tone,
  dot,
  strong = false,
  className = "",
  children,
}: {
  label: string;
  tone: string;
  dot: string;
  strong?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${CARD} animate-fade-up p-4 ${
        strong ? "ring-1 ring-[color-mix(in_srgb,var(--accent-yellow)_55%,transparent)]" : ""
      } ${className}`}
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </p>
      <div className={`mt-1.5 text-[22px] font-bold leading-tight sm:text-[28px] ${tone}`}>{children}</div>
    </div>
  );
}

// Per building: what came in from sales, what went out, what is left. A row
// per currency. "No building" collects the company's own overhead.
function BuildingTable({ data, linkable }: { data: FinanceOverview; linkable: boolean }) {
  const { t } = useLocale();
  return (
    <section className={`${CARD} overflow-hidden`}>
      <h2 className="border-b border-[var(--border-c2)] px-5 py-4 text-[15px] font-semibold text-[var(--ink-1)]">
        {t.finance.overview.byBuilding}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-[var(--ink-4)]">
            <tr className="border-b border-[var(--border-c2)]">
              <th className="px-5 py-2.5 font-medium">{t.finance.building}</th>
              <th className="px-3 py-2.5 text-right font-medium">{t.finance.income}</th>
              <th className="px-3 py-2.5 text-right font-medium">{t.finance.expense}</th>
              <th className="px-5 py-2.5 text-right font-medium">{t.finance.result}</th>
            </tr>
          </thead>
          <tbody>
            {data.by_building.map((row, i) => {
              const net = row.income - row.expense;
              const sameAsAbove = i > 0 && data.by_building[i - 1].building_id === row.building_id;
              const name = row.building_id ? (row.name ?? "—") : t.finance.companyWide;
              return (
                <tr
                  key={`${row.building_id ?? "none"}-${row.currency}`}
                  className="border-b border-[var(--border-c2)] transition-colors last:border-0 hover:bg-[var(--hover-c)]"
                >
                  <td className="px-5 py-2.5 font-medium text-[var(--ink-1)]">
                    {sameAsAbove ? null : linkable && row.building_id ? (
                      <Link href={`/buildings/${row.building_id}`} className="hover:underline">
                        {name}
                      </Link>
                    ) : (
                      <span className={row.building_id ? "" : "text-[var(--ink-3)]"}>{name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[var(--wash-emerald-ink)]">
                    <Money value={row.income} currency={row.currency} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-[var(--wash-rose-ink)]">
                    <Money value={row.expense} currency={row.currency} />
                  </td>
                  <td className={`px-5 py-2.5 text-right font-semibold ${toneFor(net)}`}>
                    <Money value={net} currency={row.currency} signed />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
