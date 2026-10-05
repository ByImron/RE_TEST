"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAccess } from "@/lib/auth/useRole";
import { PageTitle } from "@/components/PageTitle";
import { useHotkey } from "@/components/ActionBar";
import { PlusIcon } from "@/components/icons";
import { FinanceProvider, useFinance } from "@/components/finance/FinanceContext";
import { EntryModal } from "@/components/finance/EntryModal";
import { ProcurementHome } from "@/components/finance/ProcurementScreen";

// The finance section: a title, two tabs (the summary and the journal), and
// the period / building the two share. Only admin, accountant and director get
// in -- the pages behind it are locked by the database as well. (Someone who
// only buys for the company gets their own small screen instead.)
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const { canViewFinance, financeOwn, loading } = useAccess();
  const pathname = usePathname();

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

  const tabs = [
    { href: "/finance", label: t.finance.tabs.overview },
    { href: "/finance/transactions", label: t.finance.tabs.entries },
    { href: "/finance/advances", label: t.finance.tabs.advances },
  ];

  return (
    <Suspense fallback={null}>
      <FinanceProvider>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <PageTitle>{t.finance.title}</PageTitle>
            <EntryButtons />
          </div>
          <nav aria-label={t.finance.title} className="flex gap-1 border-b border-[var(--border-c)]">
            {tabs.map((tab) => {
              const on = tab.href === "/finance" ? pathname === "/finance" : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={on ? "page" : undefined}
                  className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                    on
                      ? "border-[var(--accent-yellow)] text-[var(--ink-1)]"
                      : "border-transparent text-[var(--ink-4)] hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
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

// One way in, for both directions: the dialog itself already carries the
// Расход/Приход switch, so a single button opens it (on the last direction
// used), same as "+ Новый клиент" and every other "add" button in the app --
// rather than two loud colour-coded buttons that stood out against the site's
// own black/yellow language instead of belonging to it. Reachable with N.
// Not shown to someone who can only look.
function EntryButtons() {
  const { t } = useLocale();
  const { canManage, setupMissing, openEntry } = useFinance();
  useHotkey("KeyN", () => openEntry(), canManage && !setupMissing);
  if (!canManage || setupMissing) return null;
  return (
    <button
      type="button"
      onClick={() => openEntry()}
      title={t.finance.addEntry + "  ( N )"}
      className="btn btn-primary btn-md w-full sm:w-auto"
    >
      <PlusIcon className="h-4 w-4" />
      {t.finance.addEntry}
    </button>
  );
}

// On a phone the two buttons scroll away with the page; a round button stays
// under the thumb (above the tab bar) and opens the dialog on the last direction.
function AddFab() {
  const { t } = useLocale();
  const { openEntry } = useFinance();
  return (
    <button
      type="button"
      onClick={() => openEntry()}
      aria-label={t.finance.newEntry}
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-yellow)] text-[#18181b] shadow-lg ring-1 ring-black/10 transition-transform duration-150 active:scale-95 sm:hidden print:hidden"
    >
      <PlusIcon className="h-6 w-6" />
    </button>
  );
}
