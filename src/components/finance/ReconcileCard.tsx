"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useRole } from "@/lib/auth/useRole";
import { useSingleFlight } from "@/lib/useSingleFlight";
import { CheckIcon, WarningIcon } from "@/components/icons";
import { useFinance } from "@/components/finance/FinanceContext";

type CheckResult = {
  rollup_mismatch: number;
  payments: Array<{
    currency: string;
    dashboard: number;
    contracts: number;
    journal: number;
    contracts_count: number;
    journal_count: number;
  }>;
  gaps: Array<{
    contract_id: string;
    number: string | null;
    client: string | null;
    currency: string;
    paid_amount: number;
    confirmed: number;
    gap: number;
  }>;
  building_drift: Array<{
    contract_id: string;
    number: string | null;
    client: string | null;
    entry_building: string | null;
    current_building: string | null;
    amount: number;
    currency: string;
  }>;
  duplicate_categories: Array<{ kind: string; name: string; ids: string[]; count: number }>;
};

// crm.finance_balance_check(): balances that went below zero before the
// no-overdraft rule existed (or by deleting money that was already spent).
type BalanceCheck = {
  negative_cash: Array<{ currency: string; value: number }>;
  overspent: Array<{ email: string; currency: string; balance: number }>;
};

const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const differs = (a: number, b: number) => Math.abs(a - b) > 0.005;

// "Is the money in the journal really the money in the contracts?" -- on
// demand, not on every page load. Per currency it lines up three figures: what
// the dashboard says was received (the "paid" total on the contracts), what the
// payments behind those contracts add up to, and what reached the finance
// journal. When they differ it names the contracts where the money sits without
// a payment record (so it is missing from Finance) and lets the admin book it
// as a payment. It also checks that the month totals the screens read still
// equal the sum of the entries.
export function ReconcileCard() {
  const { t } = useLocale();
  const { role } = useRole();
  const { bump } = useFinance();
  const once = useSingleFlight();
  const [result, setResult] = useState<CheckResult | null>(null);
  const [balances, setBalances] = useState<BalanceCheck | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "failed">("idle");
  const [repaired, setRepaired] = useState<number | null>(null);

  const run = async () => {
    setStatus("running");
    const db = createClient().schema("crm");
    const [check, bal] = await Promise.all([db.rpc("finance_check"), db.rpc("finance_balance_check")]);
    if (check.error || !check.data) {
      setStatus("failed");
      return;
    }
    setResult(check.data as CheckResult);
    // An older database has no balance check: the rest of the reconciliation still stands.
    setBalances(bal.error ? null : (bal.data as BalanceCheck));
    setStatus("idle");
  };

  const repair = async () => {
    setStatus("running");
    const { data, error } = await createClient().schema("crm").rpc("finance_repair_payment_gaps");
    if (error) {
      setStatus("failed");
      return;
    }
    setRepaired(typeof data === "number" ? data : null);
    bump();
    await run();
  };

  const resyncBuildings = async () => {
    setStatus("running");
    const { error } = await createClient().schema("crm").rpc("finance_resync_buildings");
    if (error) {
      setStatus("failed");
      return;
    }
    bump();
    await run();
  };

  const mismatched = result
    ? result.payments.filter(
        (p) =>
          differs(p.dashboard, p.contracts) ||
          differs(p.contracts, p.journal) ||
          p.contracts_count !== p.journal_count
      )
    : [];
  const negatives = balances ? balances.negative_cash.length + balances.overspent.length : 0;
  const ok =
    result !== null &&
    negatives === 0 &&
    mismatched.length === 0 &&
    result.gaps.length === 0 &&
    result.building_drift.length === 0 &&
    result.duplicate_categories.length === 0 &&
    result.rollup_mismatch === 0;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--border-c)] bg-[var(--surface-1)] px-5 py-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          {status === "failed" ? (
            <p className="text-sm font-medium text-[var(--wash-rose-ink)]">{t.finance.check.failed}</p>
          ) : ok ? (
            <p className="flex items-start gap-2 text-sm font-medium text-[var(--wash-emerald-ink)]">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {t.finance.check.ok.replace(
                "{n}",
                String(result.payments.reduce((sum, p) => sum + p.contracts_count, 0))
              )}
            </p>
          ) : result ? (
            <p className="flex items-start gap-2 text-sm font-medium text-[var(--wash-rose-ink)]">
              <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {t.finance.check.differs}
            </p>
          ) : (
            <p className="text-sm text-[var(--ink-4)]">{t.finance.check.hint}</p>
          )}
          {repaired !== null && repaired > 0 && (
            <p className="mt-1 text-xs text-[var(--ink-4)]">{t.finance.check.repaired.replace("{n}", String(repaired))}</p>
          )}
        </div>
        <button
          type="button"
          onClick={once(run)}
          disabled={status === "running"}
          className="btn btn-secondary btn-sm shrink-0"
        >
          {status === "running" ? t.finance.check.running : t.finance.check.button}
        </button>
      </div>

      {result && result.payments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-sm">
            <thead className="text-xs text-[var(--ink-4)]">
              <tr>
                <th className="py-1.5 pr-3 font-medium" />
                <th className="px-3 py-1.5 text-right font-medium">{t.finance.check.dashboard}</th>
                <th className="px-3 py-1.5 text-right font-medium">{t.finance.check.byContracts}</th>
                <th className="py-1.5 pl-3 text-right font-medium">{t.finance.check.inJournal}</th>
              </tr>
            </thead>
            <tbody>
              {result.payments.map((p) => (
                <tr key={p.currency} className="border-t border-[var(--border-c2)] tabular-nums">
                  <td className="py-1.5 pr-3 font-semibold text-[var(--ink-2)]">{p.currency}</td>
                  <td className="px-3 py-1.5 text-right">{nf.format(p.dashboard)}</td>
                  <td className={`px-3 py-1.5 text-right ${differs(p.dashboard, p.contracts) ? "font-semibold text-[var(--wash-rose-ink)]" : ""}`}>
                    {nf.format(p.contracts)}
                  </td>
                  <td className={`py-1.5 pl-3 text-right ${differs(p.contracts, p.journal) ? "font-semibold text-[var(--wash-rose-ink)]" : ""}`}>
                    {nf.format(p.journal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && result.gaps.length > 0 && (
        <div className="rounded-xl bg-[var(--wash-amber)] px-4 py-3 text-[var(--wash-amber-ink)]">
          <p className="text-sm font-semibold">{t.finance.check.gapTitle}</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {result.gaps.map((g) => (
              <li key={g.contract_id}>
                {t.finance.check.gapLine
                  .replace("{n}", g.number ?? "—")
                  .replace("{client}", g.client ?? "—")
                  .replace("{paid}", `${nf.format(g.paid_amount)} ${g.currency}`)
                  .replace("{confirmed}", `${nf.format(g.confirmed)} ${g.currency}`)}
              </li>
            ))}
          </ul>
          {role === "admin" && (
            <button
              type="button"
              onClick={once(repair)}
              disabled={status === "running"}
              className="btn btn-primary btn-sm mt-3"
            >
              {t.finance.check.repair}
            </button>
          )}
          <p className="mt-2 text-xs leading-snug opacity-80">{t.finance.check.repairHint}</p>
        </div>
      )}
      {result && result.building_drift.length > 0 && (
        <div className="rounded-xl bg-[var(--wash-amber)] px-4 py-3 text-[var(--wash-amber-ink)]">
          <p className="text-sm font-semibold">{t.finance.check.driftTitle}</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {result.building_drift.map((d, i) => (
              <li key={`${d.contract_id}-${i}`}>
                {t.finance.check.driftLine
                  .replace("{n}", d.number ?? "—")
                  .replace("{client}", d.client ?? "—")
                  .replace("{sum}", `${nf.format(d.amount)} ${d.currency}`)
                  .replace("{building}", d.current_building ?? t.finance.companyWide)}
              </li>
            ))}
          </ul>
          {role === "admin" && (
            <button
              type="button"
              onClick={once(resyncBuildings)}
              disabled={status === "running"}
              className="btn btn-primary btn-sm mt-3"
            >
              {t.finance.check.resync}
            </button>
          )}
          <p className="mt-2 text-xs leading-snug opacity-80">{t.finance.check.resyncHint}</p>
        </div>
      )}
      {result && result.duplicate_categories.length > 0 && (
        <div className="rounded-xl bg-[var(--wash-amber)] px-4 py-3 text-[var(--wash-amber-ink)]">
          <p className="text-sm font-semibold">{t.finance.check.dupCategoriesTitle}</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {result.duplicate_categories.map((d) => (
              <li key={`${d.kind}-${d.name}`}>
                {t.finance.check.dupCategoriesLine.replace("{name}", d.name).replace("{n}", String(d.count))}
              </li>
            ))}
          </ul>
          {role === "admin" && (
            <Link href="/settings?tab=finance" className="btn btn-primary btn-sm mt-3">
              {t.finance.check.dupCategoriesFix}
            </Link>
          )}
        </div>
      )}
      {balances && negatives > 0 && (
        <div className="rounded-xl bg-[var(--wash-rose)] px-4 py-3 text-[var(--wash-rose-ink)]">
          {balances.negative_cash.length > 0 && (
            <>
              <p className="text-sm font-semibold">{t.finance.check.negativeCashTitle}</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm tabular-nums">
                {balances.negative_cash.map((c) => (
                  <li key={c.currency}>
                    {t.finance.check.negativeCashLine
                      .replace("{currency}", c.currency)
                      .replace("{sum}", `−${nf.format(Math.abs(c.value))} ${c.currency}`)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {balances.overspent.length > 0 && (
            <>
              <p className={`text-sm font-semibold ${balances.negative_cash.length > 0 ? "mt-2.5" : ""}`}>
                {t.finance.check.overspentTitle}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm tabular-nums">
                {balances.overspent.map((p) => (
                  <li key={`${p.email}-${p.currency}`}>
                    {t.finance.check.overspentLine
                      .replace("{email}", p.email)
                      .replace("{sum}", `−${nf.format(Math.abs(p.balance))} ${p.currency}`)}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-xs leading-snug opacity-80">{t.finance.check.negativeHint}</p>
        </div>
      )}
      {result && result.rollup_mismatch > 0 && (
        <p className="text-sm font-medium text-[var(--wash-rose-ink)]">{t.finance.check.rollupBad}</p>
      )}
    </section>
  );
}
