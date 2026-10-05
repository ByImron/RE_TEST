"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { SetupNotice } from "@/components/SetupNotice";
import { Pagination } from "@/components/Pagination";
import type { Currency } from "@/lib/currency";
import { ExportMenu } from "@/components/ExportMenu";
import {
  Chip,
  ChipGroup,
  FILTER_SELECT,
  FilterMenu,
  FilterSection,
  ListToolbar,
  type ActiveFilter,
} from "@/components/ActionBar";
import {
  DebtLegend,
  DebtSummary,
  DebtorCards,
  DebtorTable,
  type ContractDebt,
} from "@/components/DebtorList";
import { PageTitle } from "@/components/PageTitle";
import { ShiftedSchedules } from "@/components/ShiftedSchedules";

const PAGE_SIZE = 25;
// Batch size for the "export everything" path -- PostgREST will not hand back
// more than this in one response anyway.
const EXPORT_BATCH = 1000;

type SortKey = "freshest" | "overdue" | "oldest" | "name";

// Which column each choice orders by, applied in the database so the order
// holds across pages.
const SORTS: Record<SortKey, { column: string; ascending: boolean }> = {
  // Most recently missed payment first -- who fell behind TODAY, then
  // yesterday, then a few days ago. These are the calls most worth making
  // first: still fresh enough that a reminder alone often fixes it, before
  // it drifts into "oldest" territory further down the list.
  freshest: { column: "latest_due", ascending: false },
  overdue: { column: "total_overdue", ascending: false },
  oldest: { column: "earliest_due", ascending: true },
  name: { column: "client_name", ascending: true },
};

// A row exactly as crm.overdue_contracts() returns it.
type OverdueRow = {
  contract_id: string;
  contract_number: string | null;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  object_name: string | null;
  currency: Currency;
  missed_count: number;
  total_overdue: number;
  remaining_total: number | null;
  earliest_due: string;
  latest_due: string;
};

// Same shape the table renders, built from one RPC row.
function toDebt(r: OverdueRow, now: number): ContractDebt {
  return {
    contractId: r.contract_id,
    clientId: r.client_id,
    clientName: r.client_name,
    clientPhone: r.client_phone,
    objectName: r.object_name,
    contractNumber: r.contract_number,
    currency: r.currency,
    missedCount: r.missed_count,
    totalOverdue: Number(r.total_overdue),
    remainingTotal: Number(r.remaining_total ?? 0),
    earliestDue: r.earliest_due,
    latestDue: r.latest_due,
    // Measured from the LATEST missed date, so it reflects the current cycle
    // and rolls forward each month instead of ballooning.
    daysOverdue: Math.floor((now - new Date(r.latest_due).getTime()) / 86_400_000),
  };
}

export default function DebtorsPage() {
  const { t } = useLocale();
  const configured = isSupabaseConfigured();
  const [rows, setRows] = useState<ContractDebt[]>([]);
  const [totals, setTotals] = useState<
    Array<{ currency: Currency; overdue: number; remaining: number; contracts: number }>
  >([]);
  // Explicit, and visible on screen. The order used to be fixed and unstated,
  // so there was no way to tell what the list was sorted by. Defaults to
  // "freshest" (who just fell behind) rather than "by amount owed" -- the
  // list is a call queue, and the most recently missed payment is the one
  // worth acting on first.
  const [sort, setSort] = useState<SortKey>("freshest");
  // Filter by ЖК: collections are organised per development, so "show me only
  // this one" is the first thing anybody asks of this list.
  const [buildingId, setBuildingId] = useState<string>("all");
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [byBuilding, setByBuilding] = useState<
    Array<{ name: string; overdue: number; remaining: number; contracts: number; currency: Currency }>
  >([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  // Bumped after the administrator restores a schedule: the list, the totals and
  // the per-building chart all describe the same arrears and must be re-read.
  const [reloadKey, setReloadKey] = useState(0);
  // "Loading" is derived, not stored. It is exactly "the data on screen does
  // not belong to the parameters currently set", so it is a comparison, not a
  // flag raised before a fetch and lowered after -- and raising it inside the
  // effect cost a second render every time a filter moved. Not configured
  // means nothing will ever load, so it is not loading either.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // Paged, 25 at a time. Two ceilings had to go here. First: the page used to
  // pull EVERY unpaid overdue installment and group them in the browser -- and
  // a two-year plan is 20-30 rows on its own, so PostgREST's 1000-row cap was
  // reachable at a few dozen debtors. Migration 038 fixed that by grouping in
  // SQL. But one contract still costs one row, so the same cap returns at a
  // thousand contracts in arrears -- and on THIS page a silently truncated
  // list means somebody who owes money never gets called. Hence real paging,
  // with the row count coming from the server rather than from rows.length.
  const queryKey = [page, sort, buildingId, reloadKey].join("|");
  const loading = configured && loadedKey !== queryKey;

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const from = (page - 1) * PAGE_SIZE;
    const order = SORTS[sort];
    createClient()
      .schema("crm")
      .rpc("overdue_contracts", { p_building_id: buildingId === "all" ? null : buildingId }, { count: "exact" })
      // Sorted in the database, so the order holds ACROSS pages -- sorting the
      // 25 rows on screen would be a different list on every page. contract_id
      // second: without a unique tiebreaker, equal values can come back in a
      // different order per page, showing one debtor twice and another never.
      .order(order.column, { ascending: order.ascending })
      .order("contract_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .then(({ data, count, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("overdue_contracts failed:", error.message);
          setFailure(error.message);
          setRows([]);
          setTotalCount(0);
          setLoadedKey(queryKey);
          return;
        }
        const batch = (data ?? []) as OverdueRow[];
        // Debts get paid while the page is open. If that emptied the page
        // we're standing on, fall back to the first one rather than showing a
        // blank table under a "3 / 2" counter.
        if (batch.length === 0 && page > 1) {
          setPage(1);
          return;
        }
        const now = Date.now();
        setFailure(null);
        setRows(batch.map((r) => toDebt(r, now)));
        setTotalCount(count ?? 0);
        setLoadedKey(queryKey);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, page, sort, buildingId, queryKey]);

  // The headline totals cover EVERY debtor, not the 25 on screen, so they come
  // from their own aggregate instead of being summed from `rows`.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    createClient()
      .schema("crm")
      .rpc("overdue_totals", { p_building_id: buildingId === "all" ? null : buildingId })
      .then(({ data, error }) => {
        if (cancelled || error) {
          if (error) console.error("overdue_totals failed:", error.message);
          return;
        }
        setTotals(
          (
            (data ?? []) as Array<{
              currency: Currency;
              contracts: number;
              total_overdue: number;
              remaining_total: number;
            }>
          )
            .map((r) => ({
              currency: r.currency,
              contracts: r.contracts,
              overdue: Number(r.total_overdue),
              remaining: Number(r.remaining_total ?? 0),
            }))
            .filter((r) => r.overdue > 0)
        );
      });
    return () => {
      cancelled = true;
    };
  }, [configured, buildingId, reloadKey]);

  // The chart shows every building regardless of the filter -- narrowing the
  // list to one ЖК shouldn't hide the comparison that tells you which ЖК to
  // narrow to. Fetched once.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.schema("crm").from("buildings").select("id, name").order("name"),
      supabase.schema("crm").rpc("overdue_by_building"),
    ]).then(([bRes, oRes]) => {
      if (cancelled) return;
      setBuildings((bRes.data ?? []) as Array<{ id: string; name: string }>);
      if (oRes.error) {
        console.error("overdue_by_building failed:", oRes.error.message);
        return;
      }
      setByBuilding(
        (
          (oRes.data ?? []) as Array<{
            building_name: string;
            currency: Currency;
            contracts: number;
            total_overdue: number;
            remaining_total: number | null;
          }>
        ).map((r) => ({
          name: r.building_name,
          currency: r.currency,
          contracts: r.contracts,
          overdue: Number(r.total_overdue),
          remaining: Number(r.remaining_total ?? 0),
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [configured, reloadKey]);

  // Grouped by currency: one panel and one scale per currency, because TJS and
  // USD on a shared axis compare nothing.
  const byCurrency = useMemo(() => {
    const seen: Currency[] = [];
    for (const r of byBuilding) if (!seen.includes(r.currency)) seen.push(r.currency);
    return seen.map((currency) => ({
      currency,
      rows: byBuilding.filter((r) => r.currency === currency),
      total: totals.find((tt) => tt.currency === currency) ?? null,
    }));
  }, [byBuilding, totals]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Export is the whole list, not the current page -- an Excel file of 25 rows
  // out of 1200 would be quietly wrong in exactly the way this change exists
  // to prevent. Fetched in batches on demand, only when the button is pressed.
  const getExportRows = async () => {
    const num = (n: number) => n.toFixed(2).replace(".", ",");
    const supabase = createClient();
    const all: ContractDebt[] = [];
    const now = Date.now();
    for (let from = 0; ; from += EXPORT_BATCH) {
      const { data, error } = await supabase
        .schema("crm")
        // The export follows the same filter as the list on screen -- a file
        // covering every ЖК while the page shows one would disagree with what
        // the person exporting it was looking at.
        .rpc("overdue_contracts", { p_building_id: buildingId === "all" ? null : buildingId })
        .range(from, from + EXPORT_BATCH - 1);
      const batch = (data ?? []) as OverdueRow[];
      if (error || batch.length === 0) break;
      all.push(...batch.map((r) => toDebt(r, now)));
      if (batch.length < EXPORT_BATCH) break;
    }
    return all.map((r) => [
      r.clientName,
      r.clientPhone ?? "",
      r.objectName ?? "",
      r.contractNumber ?? "",
      r.earliestDue,
      r.missedCount,
      num(r.totalOverdue),
      num(r.remainingTotal),
      r.currency,
    ]);
  };

  const clearAllFilters = () => {
    setBuildingId("all");
    setSort("freshest");
    setPage(1);
  };
  const sortLabels: Record<SortKey, string> = {
    freshest: t.debtors.sortByFreshest,
    overdue: t.debtors.sortByOverdue,
    oldest: t.debtors.sortByOldest,
    name: t.debtors.sortByName,
  };
  const activeFilters: ActiveFilter[] = [
    ...(buildingId !== "all"
      ? [
          {
            key: "building",
            label: buildings.find((b) => b.id === buildingId)?.name ?? t.dashboard.allBuildings,
            onRemove: () => {
              setBuildingId("all");
              setPage(1);
            },
          },
        ]
      : []),
    ...(sort !== "freshest"
      ? [
          {
            key: "sort",
            label: `${t.debtors.sortLabel}: ${sortLabels[sort]}`,
            onRemove: () => {
              setSort("freshest");
              setPage(1);
            },
          },
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageTitle>{t.debtors.title}</PageTitle>
          <p className="text-sm text-[var(--ink-4)]">{t.debtors.subtitle}</p>
        </div>
        {totalCount > 0 && (
          <ExportMenu
            getData={getExportRows}
            headers={[
              t.debtors.client,
              t.clients.table.phone,
              t.debtors.object,
              "№",
              t.debtors.oldestDue,
              t.debtors.missedPayments,
              t.debtors.overdueNow,
              t.debtors.remainingCol,
              "Валюта",
            ]}
            filenameBase="debtors"
            title={t.debtors.title}
          />
        )}
      </div>

      {!configured && <SetupNotice />}

      <ShiftedSchedules onRestored={() => setReloadKey((k) => k + 1)} />

      {failure && (
        <div className="rounded-lg border border-[var(--wash-rose-border)] bg-[var(--wash-rose)] px-4 py-3 text-sm text-[var(--wash-rose-ink)]">
          <p className="font-semibold">{t.dashboard.summaryFailed}</p>
          <p className="mt-1 text-xs opacity-80">{failure}</p>
        </div>
      )}

      {/* One card PER CURRENCY, each on its own scale: TJS and USD compare
          nothing on a shared axis. Headline = overdue right now; the bar =
          how much of the whole balance that is; the buildings say where. */}
      {byCurrency.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {byCurrency.map(({ currency, rows: cRows, total }) => (
            <DebtSummary
              key={currency}
              currency={currency}
              total={total}
              buildings={cRows}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Building + sort order in one funnel, like every other list page. */}
      {(totalCount > 0 || activeFilters.length > 0) && (
        <ListToolbar filters={activeFilters} onClearAll={clearAllFilters} clearLabel={t.common.resetFilters}>
          <FilterMenu
            label={t.common.filter}
            activeCount={(buildingId !== "all" ? 1 : 0) + (sort !== "freshest" ? 1 : 0)}
            resetLabel={t.common.resetFilters}
            onReset={() => {
              setBuildingId("all");
              setSort("freshest");
              setPage(1);
            }}
          >
            <FilterSection label={t.dashboard.allBuildings}>
              <select
                value={buildingId}
                onChange={(e) => {
                  setBuildingId(e.target.value);
                  setPage(1);
                }}
                aria-label={t.dashboard.allBuildings}
                className={FILTER_SELECT}
              >
                <option value="all">{t.dashboard.allBuildings}</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </FilterSection>
            <FilterSection label={t.debtors.sortLabel}>
              <ChipGroup>
                {(
                  [
                    ["freshest", t.debtors.sortByFreshest],
                    ["overdue", t.debtors.sortByOverdue],
                    ["oldest", t.debtors.sortByOldest],
                    ["name", t.debtors.sortByName],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <Chip
                    key={key}
                    label={label}
                    active={sort === key}
                    onClick={() => {
                      setSort(key);
                      setPage(1);
                    }}
                  />
                ))}
              </ChipGroup>
            </FilterSection>
          </FilterMenu>
        </ListToolbar>
      )}

      {rows.length > 0 && <DebtLegend t={t} />}
      <DebtorTable rows={rows} loading={loading} t={t} />
      <DebtorCards rows={rows} loading={loading} t={t} />

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}
