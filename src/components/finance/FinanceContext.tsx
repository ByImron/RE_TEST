"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { useSearchParams } from "next/navigation";
import { useAccess } from "@/lib/auth/useRole";
import { periodRange, type DateRange, type PeriodPreset } from "@/lib/finance/period";
import type { FinanceCategory, FinanceEntry, FinanceKind } from "@/lib/finance/types";

export type BuildingOption = { id: string; name: string };

type FinanceState = {
  canManage: boolean;
  /** Buys for the company: enters and sees only their own expenses. */
  ownOnly: boolean;
  preset: PeriodPreset;
  setPreset: (p: PeriodPreset) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
  range: DateRange;
  buildingId: string; // "all" | "none" | a building id
  setBuildingId: (id: string) => void;
  buildings: BuildingOption[];
  categories: FinanceCategory[];
  reloadCategories: () => void;
  /** Adds a category and returns its id (or an error message). */
  createCategory: (kind: FinanceKind, name: string) => Promise<{ id: string | null; error: string | null }>;
  /** The finance tables are not in the database yet (the SQL was not run). */
  setupMissing: boolean;
  /** Bumped after any change, so every screen re-reads. */
  version: number;
  bump: () => void;
  /** The new/edit entry dialog: open from anywhere, rendered once by the layout. */
  editor: { entry?: FinanceEntry; kind: FinanceKind } | null;
  openEntry: (kind?: FinanceKind) => void;
  editEntry: (entry: FinanceEntry) => void;
  closeEditor: () => void;
  /** Remembers the direction of the last saved entry: the next dialog opens on it. */
  rememberKind: (kind: FinanceKind) => void;
};

const Ctx = createContext<FinanceState | null>(null);

export function useFinance(): FinanceState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFinance must be used inside FinanceProvider");
  return ctx;
}

// PostgREST says this when a table is not in its schema cache; Postgres says
// 42P01. Either way: the database is behind the program.
const isMissingTable = (e: { code?: string; message?: string }) =>
  e.code === "PGRST205" || e.code === "42P01" || /schema cache|does not exist/i.test(e.message ?? "");

// The period, building and the lookup lists (buildings, categories) the
// overview and the journal share -- so switching between the two keeps what
// you were looking at.
export function FinanceProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const { canManageFinance, financeOwn } = useAccess();
  // /finance?building=<id> (the link on a building's own page) opens narrowed to it.
  const initialBuilding = useSearchParams().get("building");

  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [buildingId, setBuildingId] = useState(initialBuilding || "all");
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [setupMissing, setSetupMissing] = useState(false);
  const [version, setVersion] = useState(0);
  const [catVersion, setCatVersion] = useState(0);
  const [editor, setEditor] = useState<FinanceState["editor"]>(null);
  // The direction last used opens next time: bookkeeping comes in runs.
  const [lastKind, setLastKind] = useState<FinanceKind>("expense");

  const range = useMemo(
    () => periodRange(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo]
  );

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const db = createClient().schema("crm");
    // A person who only enters their own expenses is not given the buildings
    // (addresses, prices) -- just a bare id + name list to choose from.
    const query = financeOwn
      ? db.rpc("finance_building_options")
      : db.from("buildings").select("id, name").order("name");
    void Promise.resolve(query).then(({ data }) => {
      if (!cancelled) setBuildings((data ?? []) as BuildingOption[]);
    });
    return () => {
      cancelled = true;
    };
  }, [configured, financeOwn]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    createClient()
      .schema("crm")
      .from("finance_categories")
      .select("id, kind, name, code, sort, archived")
      .order("sort")
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error && isMissingTable(error)) setSetupMissing(true);
        else if (!error) setSetupMissing(false);
        setCategories((data ?? []) as FinanceCategory[]);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, catVersion]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const reloadCategories = useCallback(() => setCatVersion((v) => v + 1), []);

  const openEntry = useCallback(
    (kind?: FinanceKind) => setEditor({ kind: kind ?? lastKind }),
    [lastKind]
  );
  const editEntry = useCallback((entry: FinanceEntry) => setEditor({ entry, kind: entry.kind }), []);
  const closeEditor = useCallback(() => setEditor(null), []);

  const createCategory = useCallback(
    async (kind: FinanceKind, name: string) => {
      // After the existing ones but before the catch-all "other" (sort 99).
      const sort = categories
        .filter((c) => c.kind === kind && c.sort < 99)
        .reduce((m, c) => Math.max(m, c.sort), 0) + 1;
      const { data, error } = await createClient()
        .schema("crm")
        .from("finance_categories")
        .insert({ kind, name, sort })
        .select("id");
      if (error) return { id: null, error: error.message };
      reloadCategories();
      return { id: (data?.[0] as { id: string } | undefined)?.id ?? null, error: null };
    },
    [categories, reloadCategories]
  );

  const value: FinanceState = {
    canManage: canManageFinance,
    ownOnly: financeOwn,
    preset,
    setPreset,
    customFrom,
    customTo,
    setCustomFrom,
    setCustomTo,
    range,
    buildingId,
    setBuildingId,
    buildings,
    categories,
    reloadCategories,
    createCategory,
    setupMissing,
    version,
    bump,
    editor,
    openEntry,
    editEntry,
    closeEditor,
    rememberKind: setLastKind,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
