"use client";

import { Suspense } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAccess } from "@/lib/auth/useRole";
import { PageTitle } from "@/components/PageTitle";
import { PulsingFab } from "@/components/finance/PulsingFab";
import { FinanceProvider, useFinance } from "@/components/finance/FinanceContext";
import { EntryModal } from "@/components/finance/EntryModal";
import { ProcurementHome } from "@/components/finance/ProcurementScreen";

// The finance section: the title, and under it the three parts (summary, journal,
// money under report) with the period / building they share. Only admin,
// accountant and director get in -- the pages behind it are locked by the
// database as well. (Someone who only buys for the company gets their own small
// screen instead.)
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const { canViewFinance, financeOwn, loading } = useAccess();

  if (loading) return <p className="text-[var(--ink-5)]">{t.common.loading}</p>;
  // Someone who only buys for the company gets their own small screen instead
  // of the books: their balance, their expenses, one button.
  if (financeOwn) {
    return (
      <Suspense fallback={null}>
        <FinanceProvider>
          <ProcurementHome />
        </FinanceProvider>
      </Suspense>
    );
  }
  if (!canViewFinance) {
    return (
      <div className="flex flex-col gap-3">
        <PageTitle>{t.finance.title}</PageTitle>
        <p className="text-[var(--ink-4)]">{t.finance.denied}</p>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <FinanceProvider>
        <div className="flex flex-col gap-5">
          {/* The same head as every other page: the title, one quiet line under it. The
              section's tabs, the filter and the "+" sit on the toolbar row of each page. */}
          <div>
            <PageTitle>{t.finance.title}</PageTitle>
            <p className="mt-2 text-sm text-[var(--ink-4)]">{t.finance.subtitle}</p>
          </div>
          <FinanceBody>{children}</FinanceBody>
        </div>
      </FinanceProvider>
    </Suspense>
  );
}

// If the finance tables are not in the database yet (the SQL was not run), say
// so plainly instead of showing empty lists and forms that cannot save.
function FinanceBody({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const { setupMissing, editor, closeEditor, canManage } = useFinance();
  if (!setupMissing) {
    return (
      <>
        {children}
        {canManage && editor && (
          <EntryModal entry={editor.entry} initialKind={editor.kind} onClose={closeEditor} />
        )}
        {canManage && !editor && <AddFab />}
      </>
    );
  }
  return (
    <div
      role="alert"
      className="rounded-2xl border border-[var(--wash-amber-border)] bg-[var(--wash-amber)] p-5 text-[var(--wash-amber-ink)]"
    >
      <p className="text-base font-semibold">{t.finance.setup.title}</p>
      <p className="mt-1.5 text-sm leading-relaxed">{t.finance.setup.body}</p>
    </div>
  );
}

// On a phone the toolbar's "+" is hidden and this round one stays under the
// thumb (above the tab bar): one yellow circle with a plus, pulsing softly. It
// opens the dialog on the last direction used. It is never locked here: even
// with an empty till the dialog can still take an income, which is exactly what
// lifts the till off zero -- the expense side explains itself inside the dialog.
function AddFab() {
  const { t } = useLocale();
  const { openEntry } = useFinance();
  return (
    <PulsingFab
      label={t.finance.newEntry}
      onClick={() => openEntry()}
      className="bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 sm:hidden"
    />
  );
}
