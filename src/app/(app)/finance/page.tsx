"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAccess } from "@/lib/auth/useRole";
import { SetupNotice } from "@/components/SetupNotice";
import { Chip, ChipGroup, ListToolbar } from "@/components/ActionBar";
import { ArrowDownLeftIcon, ArrowUpRightIcon, CheckIcon, LockIcon, MoneyIcon, WalletIcon } from "@/components/icons";
import { StatCard } from "@/components/StatCard";
import { HBarChart, type HBarDatum } from "@/components/charts/HBarChart";
import { CHART_HUES, compactNumber } from "@/components/charts/palette";
import { CURRENCIES, type Currency } from "@/lib/currency";
import { localISO, monthStartOffset } from "@/lib/finance/period";
import { categoryLabel, type CashBalance, type CashflowRow, type FinanceOverview } from "@/lib/finance/types";
import { buildMoneyMap } from "@/lib/finance/moneyMap";
import { useFinance } from "@/components/finance/FinanceContext";
import { ReconcileCard } from "@/components/finance/ReconcileCard";
import { Money, toneFor } from "@/components/finance/FinanceParts";
import { CashflowChart } from "@/components/finance/CashflowChart";
import { MoneyMap } from "@/components/finance/MoneyMap";
import {
  AddEntryGroup,
  FinanceFilter,
  FinanceTabs,
  useCommonFilterState,
} from "@/components/finance/FinanceToolbarParts";

// Expenses are red throughout, the same red as the expense bars and dots --
// a ranking of categories does not need a colour per row.
const EXPENSE_HUE = CHART_HUES[3];
const MAX_MONTHS = 12;

const CARD = "rounded-2xl border border-[var(--border-c)] bg-[var(--surface-1)] shadow-sm";

export default function FinanceOverviewPage() {
  const { t } = useLocale();
  const { canViewSales } = useAccess();
  const configured = isSupabaseConfigured();
  const { range, buildingId, version, setupMissing } = useFinance();
  const filters = useCommonFilterState();

  const [data, setData] = useState<FinanceOverview | null>(null);
  const [trend, setTrend] = useState<FinanceOverview["by_month"]>([]);
  const [cash, setCash] = useState<CashBalance[]>([]);
  const [flow, setFlow] = useState<CashflowRow[]>([]);
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

  // The month-end till for the cash-flow chart: the same twelve months as the
  // trend above, company-wide. Missing (an older database) just leaves the till
  // line out -- the income/expense bars come from the trend either way.
  useEffect(() => {
    if (!configured || setupMissing) return;
    let cancelled = false;
    const from = localISO(monthStartOffset(trendEnd, -(MAX_MONTHS - 1)));
    createClient()
      .schema("crm")
      .rpc("finance_cashflow", { p_from: from, p_to: trendEnd })
      .then(({ data: result, error }) => {
        if (!cancelled) setFlow(error ? [] : ((result ?? []) as CashflowRow[]));
      });
    return () => {
      cancelled = true;
    };
  }, [configured, setupMissing, trendEnd, version]);

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

  // A currency is shown when the period has anything in it OR the till holds some of it:
  // money sitting in dollars must not vanish from the page because none moved this month.
  const currencies = useMemo(
    () =>
      CURRENCIES.filter(
        (c) => data?.totals.some((row) => row.currency === c) || cash.some((row) => row.currency === c)
      ),
    [data, cash]
  );

  return (
    <div className="flex flex-col gap-5">
      {!configured && <SetupNotice />}

      {/* The same row as every list page: where am I on the left, then the filter and
          the one yellow "+" on the right. */}
      <ListToolbar sticky={false} filters={filters.chips} onClearAll={filters.reset} clearLabel={t.common.resetFilters}>
        <FinanceTabs />
        <FinanceFilter />
        <AddEntryGroup />
      </ListToolbar>

      {failure && (
        <p role="alert" className="rounded-lg bg-[var(--wash-rose)] px-4 py-3 text-sm text-[var(--wash-rose-ink)]">
          {t.finance.loadFailed}
        </p>
      )}

      {loading && !data && <p className="text-[var(--ink-5)]">{t.common.loading}</p>}

      {data && currencies.length === 0 && !loading && (
        <p className={`${CARD} px-5 py-10 text-center text-sm text-[var(--ink-4)]`}>{t.finance.overview.empty}</p>
      )}

      {data &&
        currencies.map((currency) => (
          <CurrencyBlock
            key={currency}
            currency={currency}
            showHeading={currencies.length > 1}
            cash={cash.find((row) => row.currency === currency) ?? null}
            data={data}
            trend={trend}
            trendEnd={trendEnd}
            flow={flow}
          />
        ))}

      {data && data.by_building.length > 0 && (
        <BuildingTable data={data} linkable={canViewSales} />
      )}

      {data && <ReconcileCard />}

    </div>
  );
}

// Everything for one currency: the three headline numbers, the months, and
// where the expenses went. Currencies never share a block or a scale.
function CurrencyBlock({
  currency,
  showHeading,
  cash,
  data,
  trend,
  trendEnd,
  flow,
}: {
  currency: Currency;
  showHeading: boolean;
  cash: CashBalance | null;
  data: FinanceOverview;
  trend: FinanceOverview["by_month"];
  trendEnd: string;
  flow: CashflowRow[];
}) {
  const { t } = useLocale();
  const { buildingId } = useFinance();
  const [mapMode, setMapMode] = useState<"category" | "building">("category");
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

  // Income and expense come from the trend (they follow the building filter);
  // the till at the end of each month and the money handed out under report come
  // from the cash flow, which is company-wide -- so the till line is drawn only
  // when no single building is selected, and only when every month has it.
  const chart = useMemo(() => {
    const byMonth = new Map(flow.filter((r) => r.currency === currency).map((r) => [r.month, r]));
    const rows = months.map((m) => ({
      month: m.month,
      income: m.income,
      expense: m.expense,
      advances: byMonth.get(m.month)?.advances ?? 0,
      cash_end: byMonth.get(m.month)?.cash_end ?? 0,
    }));
    const showBalance = buildingId === "all" && months.length > 0 && months.every((m) => byMonth.has(m.month));
    return { rows, showBalance };
  }, [flow, months, currency, buildingId]);

  // Where the money of the period came from and where it went. Two readings of
  // the same totals: by category, or by building.
  const map = useMemo(() => {
    const inRows =
      mapMode === "category"
        ? data.by_category
            .filter((c) => c.kind === "income" && c.currency === currency)
            .map((c) => ({
              key: c.category_id ?? "none",
              label: categoryLabel(c.name ? { name: c.name, code: c.code } : null, t.finance.categories.contractPayments, t.finance.noCategory),
              value: c.total,
            }))
        : data.by_building
            .filter((b) => b.currency === currency)
            .map((b) => ({
              key: b.building_id ?? "none",
              label: b.building_id ? (b.name ?? "—") : t.finance.moneyMap.noBuilding,
              value: b.income,
            }));
    const outRows =
      mapMode === "category"
        ? data.by_category
            .filter((c) => c.kind === "expense" && c.currency === currency)
            .map((c) => ({
              key: c.category_id ?? "none",
              label: categoryLabel(c.name ? { name: c.name, code: c.code } : null, t.finance.categories.contractPayments, t.finance.noCategory),
              value: c.total,
            }))
        : data.by_building
            .filter((b) => b.currency === currency)
            .map((b) => ({
              key: b.building_id ?? "none",
              label: b.building_id ? (b.name ?? "—") : t.finance.moneyMap.noBuilding,
              value: b.expense,
            }));
    return buildMoneyMap({
      income: inRows,
      expense: outRows,
      labels: { other: t.finance.moneyMap.other, leftover: t.finance.moneyMap.leftover, reserve: t.finance.moneyMap.fromReserve },
    });
  }, [data, currency, mapMode, t]);

  const expenseBars: HBarDatum[] = data.by_category
    .filter((c) => c.kind === "expense" && c.currency === currency)
    .map((c) => ({
      label: categoryLabel(c.name ? { name: c.name, code: c.code } : null, t.finance.categories.contractPayments, t.finance.noCategory),
      value: c.total,
      hue: EXPENSE_HUE,
    }));

  return (
    <section className="flex flex-col gap-4">
      {showHeading && (
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">{currency}</h2>
      )}

      {/* The dashboard's own cards, so the numbers read the same here as there. The first
          is the till today (it ignores the period and the building, which is why it says
          whether expenses are open); the other three are the chosen period. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cash && (
          <StatCard
            label={t.finance.balance}
            tone={cash.value > 0.004 ? "slate" : "rose"}
            icon={<WalletIcon className="h-4 w-4" />}
            value={<Money value={cash.value} currency={currency} signed />}
            sub={
              <span title={t.finance.balanceHint} className="flex flex-col gap-1">
                <span
                  className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    cash.value > 0.004
                      ? "bg-[var(--wash-emerald)] text-[var(--wash-emerald-ink)]"
                      : "bg-[var(--wash-rose)] text-[var(--wash-rose-ink)]"
                  }`}
                >
                  {cash.value > 0.004 ? <CheckIcon className="h-3 w-3" /> : <LockIcon className="h-3 w-3" />}
                  {cash.value > 0.004 ? t.finance.funds.open : t.finance.funds.closed}
                </span>
                {cash.on_hand > 0 && (
                  <span>
                    {t.finance.onHand.replace("{sum}", `${new Intl.NumberFormat("ru-RU").format(cash.on_hand)} ${currency}`)}
                  </span>
                )}
              </span>
            }
          />
        )}
        <StatCard
          label={t.finance.income}
          tone="emerald"
          icon={<ArrowDownLeftIcon className="h-4 w-4" />}
          value={<Money value={totals.income} currency={currency} />}
        />
        <StatCard
          label={t.finance.expense}
          tone="rose"
          icon={<ArrowUpRightIcon className="h-4 w-4" />}
          value={<Money value={totals.expense} currency={currency} />}
        />
        <StatCard
          label={t.finance.result}
          tone={net < 0 ? "rose" : net > 0 ? "emerald" : "slate"}
          icon={<MoneyIcon className="h-4 w-4" />}
          value={<Money value={net} currency={currency} signed />}
        />
      </div>

      {totals.entries ? (
        <p className="-mt-1 text-xs text-[var(--ink-5)]">
          {t.finance.overview.operations.replace("{n}", String(totals.entries))}
        </p>
      ) : null}

      <div className={`${CARD} min-w-0 p-5`}>
        <h2 className="text-[15px] font-semibold text-[var(--ink-1)]">{t.finance.cashflow.title}</h2>
        <p className="mb-4 mt-0.5 text-xs text-[var(--ink-5)]">{t.finance.cashflow.hint}</p>
        {chart.rows.length > 0 ? (
          <CashflowChart data={chart.rows} currency={currency} showBalance={chart.showBalance} />
        ) : (
          <p className="text-sm text-[var(--ink-5)]">{t.finance.cashflow.empty}</p>
        )}
        {chart.rows.length > 0 && !chart.showBalance && buildingId !== "all" && (
          <p className="mt-2 text-xs text-[var(--ink-5)]">{t.finance.cashflow.companyNote}</p>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={`${CARD} min-w-0 p-5`}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--ink-1)]">{t.finance.moneyMap.title}</h2>
              <p className="mt-0.5 max-w-md text-xs text-[var(--ink-5)]">{t.finance.moneyMap.hint}</p>
            </div>
            <ChipGroup>
              <Chip label={t.finance.moneyMap.byCategory} active={mapMode === "category"} onClick={() => setMapMode("category")} />
              <Chip label={t.finance.moneyMap.byBuilding} active={mapMode === "building"} onClick={() => setMapMode("building")} />
            </ChipGroup>
          </div>
          {map.total > 0 ? (
            <MoneyMap
              sources={map.sources}
              uses={map.uses}
              total={map.total}
              currency={currency}
              totalLabel={t.finance.moneyMap.total.replace("{sum}", `${new Intl.NumberFormat("ru-RU").format(Math.round(map.total * 100) / 100)} ${currency}`)}
              ariaLabel={t.finance.moneyMap.aria
                .replace("{in}", `${new Intl.NumberFormat("ru-RU").format(map.incomeTotal)} ${currency}`)
                .replace("{out}", `${new Intl.NumberFormat("ru-RU").format(map.expenseTotal)} ${currency}`)}
              moneyIn={t.finance.moneyMap.moneyIn}
              moneyOut={t.finance.moneyMap.moneyOut}
            />
          ) : (
            <p className="text-sm text-[var(--ink-5)]">{t.finance.moneyMap.empty}</p>
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
