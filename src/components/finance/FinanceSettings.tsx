"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { FinanceCategory } from "@/lib/finance/types";
import { CategoriesEditor } from "@/components/finance/CategoriesModal";

// Settings → Финансы: the company's income and expense categories. Loads its
// own list (Settings is outside the Finance section and its shared state).
export function FinanceSettings() {
  const { t } = useLocale();
  const configured = isSupabaseConfigured();
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [missing, setMissing] = useState(false);
  const [version, setVersion] = useState(0);

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
        setMissing(!!error);
        setCategories((data ?? []) as FinanceCategory[]);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, version]);

  if (missing) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-[var(--wash-amber-border)] bg-[var(--wash-amber)] p-4 text-[var(--wash-amber-ink)]"
      >
        <p className="text-sm font-semibold">{t.finance.setup.title}</p>
        <p className="mt-1 text-sm leading-relaxed">{t.finance.setup.body}</p>
      </div>
    );
  }
  return <CategoriesEditor categories={categories} onChanged={() => setVersion((v) => v + 1)} hideHint showPresets />;
}
