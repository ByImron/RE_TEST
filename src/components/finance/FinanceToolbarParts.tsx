"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  Chip,
  ChipGroup,
  ControlGroup,
  FILTER_DATE,
  FILTER_SELECT,
  FilterMenu,
  FilterSection,
  GroupDivider,
  IconAction,
  PillLink,
  type ActiveFilter,
} from "@/components/ActionBar";
import { PlusIcon } from "@/components/icons";
import { MIN_BUSINESS_DATE, yearsAheadISO } from "@/lib/dates";
import { formatShortDate } from "@/lib/formatDate";
import type { PeriodPreset } from "@/lib/finance/period";
import { useFinance } from "@/components/finance/FinanceContext";

const PRESETS: Exclude<PeriodPreset, "custom">[] = ["month", "prevMonth", "quarter", "year", "all"];

// The three parts of the section as pills in the same bordered box every other
// toolbar uses -- the leftmost thing on the toolbar row, so the row reads
// "where am I | narrow it down | do something", the same as on every list page.
export function FinanceTabs() {
  const { t } = useLocale();
  const pathname = usePathname();
  const tabs = [
    { href: "/finance", label: t.finance.tabs.overview },
    { href: "/finance/transactions", label: t.finance.tabs.entries },
    { href: "/finance/advances", label: t.finance.tabs.advances },
  ];
  return (
    <nav aria-label={t.finance.title} className="mr-auto min-w-0 max-sm:w-full">
      <ControlGroup scrollable>
        {tabs.map((tab) => (
          <PillLink
            key={tab.href}
            href={tab.href}
            label={tab.label}
            active={tab.href === "/finance" ? pathname === "/finance" : pathname.startsWith(tab.href)}
          />
        ))}
      </ControlGroup>
    </nav>
  );
}

// "Add an operation": the one yellow "+" of the page, like "add client" on the
// clients page, reachable with N. Tablet and up only -- on a phone the round
// button at the bottom of the screen is the one way in (never both). To glue it
// to neighbours inside their group pass `divider`; on its own use <AddEntryGroup/>.
export function AddEntryAction({ divider = false }: { divider?: boolean }) {
  const { t } = useLocale();
  const { canManage, setupMissing, openEntry } = useFinance();
  if (!canManage || setupMissing) return null;
  return (
    <span className="hidden sm:contents">
      {divider && <GroupDivider />}
      <IconAction
        label={t.finance.addEntry}
        icon={<PlusIcon />}
        tone="primary"
        shortcut="N"
        onClick={() => openEntry()}
      />
    </span>
  );
}

export function AddEntryGroup() {
  const { canManage, setupMissing } = useFinance();
  if (!canManage || setupMissing) return null;
  return (
    <span className="hidden sm:inline-flex">
      <ControlGroup>
        <AddEntryAction />
      </ControlGroup>
    </span>
  );
}

// Applied filters as removable chips (the period is not one of them -- it is
// written on the filter button itself), plus how many differ from the default.
export function useCommonFilterState(): { chips: ActiveFilter[]; count: number; reset: () => void } {
  const { t } = useLocale();
  const { preset, setPreset, buildingId, setBuildingId, buildings } = useFinance();
  const chips: ActiveFilter[] = [];
  if (buildingId !== "all") {
    chips.push({
      key: "building",
      label:
        buildingId === "none"
          ? t.finance.companyWide
          : (buildings.find((b) => b.id === buildingId)?.name ?? t.finance.building),
      onRemove: () => setBuildingId("all"),
    });
  }
  return {
    chips,
    count: chips.length + (preset !== "month" ? 1 : 0),
    reset: () => {
      setPreset("month");
      setBuildingId("all");
    },
  };
}

// ONE control for everything that narrows the figures: it says the period it
// is showing ("Этот месяц") and opens a panel with the periods, a custom range,
// the building -- and whatever the page adds (kind, category). It replaces a
// row of period buttons AND a separate filter, which read as two filters.
export function FinanceFilter({
  extra,
  extraCount = 0,
  onResetExtra,
}: {
  /** Page-specific sections, placed under the shared ones. */
  extra?: ReactNode;
  extraCount?: number;
  onResetExtra?: () => void;
}) {
  const { t } = useLocale();
  const {
    preset,
    range,
    setPreset,
    setCustomFrom,
    setCustomTo,
    buildingId,
    setBuildingId,
    buildings,
  } = useFinance();
  const common = useCommonFilterState();

  const from = range.from ?? "";
  const to = range.to ?? "";
  const max = yearsAheadISO(1);

  const summary =
    preset === "custom"
      ? `${from ? formatShortDate(from) : "…"} — ${to ? formatShortDate(to) : "…"}`
      : t.finance.periods[preset];

  // Typing a date always means "my own range": seed the other end from the
  // preset that was showing, so picking just one date does not blank the view.
  const changeDate = (which: "from" | "to", value: string) => {
    if (preset !== "custom") {
      setCustomFrom(which === "from" ? value : from);
      setCustomTo(which === "to" ? value : to);
      setPreset("custom");
      return;
    }
    if (which === "from") setCustomFrom(value);
    else setCustomTo(value);
  };

  return (
    <FilterMenu
      label={t.common.filter}
      summary={summary}
      activeCount={common.count + extraCount}
      onReset={() => {
        common.reset();
        onResetExtra?.();
      }}
      resetLabel={t.common.resetFilters}
    >
      <FilterSection label={t.finance.period}>
        <ChipGroup>
          {PRESETS.map((p) => (
            <Chip
              key={p}
              label={t.finance.periods[p]}
              active={preset === p}
              onClick={() => setPreset(p)}
            />
          ))}
        </ChipGroup>
        <div className="flex items-center gap-1.5 pt-1">
          <input
            type="date"
            value={from}
            min={MIN_BUSINESS_DATE}
            max={to || max}
            onChange={(e) => changeDate("from", e.target.value)}
            aria-label={t.finance.periodFrom}
            className={FILTER_DATE}
          />
          <span className="text-xs text-[var(--ink-5)]">—</span>
          <input
            type="date"
            value={to}
            min={from || MIN_BUSINESS_DATE}
            max={max}
            onChange={(e) => changeDate("to", e.target.value)}
            aria-label={t.finance.periodTo}
            className={FILTER_DATE}
          />
        </div>
      </FilterSection>
      <FilterSection label={t.finance.building}>
        <select
          value={buildingId}
          onChange={(e) => setBuildingId(e.target.value)}
          className={FILTER_SELECT}
        >
          <option value="all">{t.finance.allBuildings}</option>
          <option value="none">{t.finance.companyWide}</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </FilterSection>
      {extra}
    </FilterMenu>
  );
}
