"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";

export function SetupNotice() {
  const { t } = useLocale();
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-[var(--wash-amber-border)] dark:bg-[var(--wash-amber)] dark:text-[var(--wash-amber-ink)]">
      {t.common.supabaseNotConfigured}
    </div>
  );
}
