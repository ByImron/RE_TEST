"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { SetupNotice } from "@/components/SetupNotice";
import { Pagination } from "@/components/Pagination";
import type { Currency } from "@/lib/currency";
import { ExportMenu } from "@/components/ExportMenu";
import { WhatsAppAllAction } from "@/components/DebtorsWhatsApp";
import {
  Chip,
  ChipGroup,
  ControlGroup,
  FILTER_SELECT,
  FilterMenu,
  FilterSection,
  ListToolbar,
  type ActiveFilter,
} from "@/components/ActionBar";
import { DebtLegend, DebtSummary, DebtorCards, DebtorTable } from "@/components/DebtorList";
import {
  DEBT_SORTS,
  fetchAllDebtors,
  toDebt,
  type ContractDebt,
  type DebtSortKey,
  type OverdueRow,
} from "@/lib/debtors/debtors";
import { buildCallList, callListHeaders, loadFlatInfo } from "@/lib/debtors/callList";
import { PageTitle } from "@/components/PageTitle";
import { ShiftedSchedules } from "@/components/ShiftedSchedules";
import { DueThisMonthChart } from "@/components/DueThisMonthChart";
import { useApartmentNumbers } from "@/lib/buildings/useApartmentNumbers";

const PAGE_SIZE = 25;

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
  const [sort, setSort] = useState<DebtSortKey>("freshest");
  // Filter by ЖК: collections are organised per development, so "show me only
  // this one" is the first thing anybody asks of this list.
  const [buildingId, setBuildingId] = useState<string>("all");
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
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
    const order = DEBT_SORTS[sort];
    createClient()
      .schema("crm")
      .rpc("overdue_contracts", { p_building_id: buildingId === "all" ? null : buildingId }, { count: "exact" })
      // Sorted in the database, so the order holds ACROSS pages -- sorting the
      // 25 rows on screen would be a different list on every page. contract_id
      // second: without a unique tiebreaker, equal values can come back in a
      // different order per page, showing one debtor twice and another never.
      .order(order.column, { ascending: order.ascending, nullsFirst: order.nullsFirst })
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

  // Flat numbers for the buildings on screen -- the list says "квартира 34", not just the
  // stored "№6-4". The number is worked out from the building's grid, once per building.
  const flatNumbers = useApartmentNumbers(rows.map((r) => r.buildingId));

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

  // The ЖК filter lists every building, whatever is picked now. Fetched once.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    createClient()
      .schema("crm")
      .from("buildings")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (!cancelled) setBuildings((data ?? []) as Array<{ id: string; name: string }>);
      });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // The call list is the WHOLE list, not the current page -- an Excel file or a
  // printed sheet of 25 rows out of 1200 would be quietly wrong in exactly the way
  // paging exists to prevent. Read on demand, in the order and under the filter on
  // screen (lib/debtors), with the flats' numbers/floors/areas looked up for the
  // sheet. A failed flat lookup only leaves those details out.
  const getCallList = async () => {
    const supabase = createClient();
    const debts = await fetchAllDebtors(supabase, { buildingId, sort });
    const flats = await loadFlatInfo(supabase, debts).catch(() => new Map());
    const list = buildCallList(debts, flats, t);
    return { rows: list.rows, pdf: list.pdf };
  };

  const clearAllFilters = () => {
    setBuildingId("all");
    setSort("freshest");
    setPage(1);
  };
  const sortLabels: Record<DebtSortKey, string> = {
    freshest: t.debtors.sortByFreshest,
    lastPayment: t.debtors.sortByLastPayment,
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
      </div>

      {!configured && <SetupNotice />}

      <ShiftedSchedules ready={configured && !loading} onRestored={() => setReloadKey((k) => k + 1)} />

      {failure && (
        <div className="rounded-lg border border-[var(--wash-rose-border)] bg-[var(--wash-rose)] px-4 py-3 text-sm text-[var(--wash-rose-ink)]">
          <p className="font-semibold">
            {/statement timeout|canceling statement/i.test(failure) ? t.debtors.loadTimeout : t.dashboard.summaryFailed}
          </p>
          <p className="mt-1 text-xs opacity-80">{failure}</p>
        </div>
      )}

      {/* One card PER CURRENCY, each on its own scale: TJS and USD compare
          nothing on a shared axis. Headline = overdue right now; the bar =
          how much of the whole balance that is. */}
      {totals.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {totals.map((tt) => (
            <DebtSummary key={tt.currency} currency={tt.currency} total={tt} t={t} />
          ))}
        </div>
      )}

      {/* Who has to pay THIS month, per ЖК -- the forward-looking counterpart of the arrears above. */}
      <DueThisMonthChart />

      {/* Building + sort order in one funnel, like every other list page. */}
      {(totalCount > 0 || activeFilters.length > 0) && (
        <ListToolbar sticky={false} filters={activeFilters} onClearAll={clearAllFilters} clearLabel={t.common.resetFilters}>
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
                    ["lastPayment", t.debtors.sortByLastPayment],
                    ["overdue", t.debtors.sortByOverdue],
                    ["oldest", t.debtors.sortByOldest],
                    ["name", t.debtors.sortByName],
                  ] as Array<[DebtSortKey, string]>
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
          {/* The two things to do with the WHOLE list, in one box beside the filter: hand
              it over as a call sheet (PDF / Excel), or message everyone in WhatsApp. Both
              read the list under the filter and sort on screen. */}
          {totalCount > 0 && (
            <ControlGroup>
              <WhatsAppAllAction buildingId={buildingId} sort={sort} />
              <ExportMenu
                bare
                getData={getCallList}
                headers={callListHeaders(t)}
                filenameBase="debtors"
                title={t.debtors.call.title}
                label={t.debtors.call.button}
                pdfLabel={t.debtors.call.pdf}
              />
            </ControlGroup>
          )}
        </ListToolbar>
      )}

      {rows.length > 0 && <DebtLegend t={t} />}
      <DebtorTable rows={rows} loading={loading} flatNumbers={flatNumbers} t={t} />
      <DebtorCards rows={rows} loading={loading} flatNumbers={flatNumbers} t={t} />

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}
