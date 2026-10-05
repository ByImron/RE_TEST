import type { ContractStatus } from "./types";

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  draft: "bg-slate-200 text-slate-600 dark:bg-[var(--hover-c2)] dark:text-[var(--ink-3)]",
  active: "bg-sky-100 text-sky-700 dark:bg-[var(--wash-sky)] dark:text-[var(--wash-sky-ink)]",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-[var(--wash-emerald)] dark:text-[var(--wash-emerald-ink)]",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-[var(--wash-rose)] dark:text-[var(--wash-rose-ink)]",
};
