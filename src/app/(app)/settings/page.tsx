"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { SetupNotice } from "@/components/SetupNotice";
import { FileUploadField } from "@/components/FileUploadField";
import { SmsScheduler } from "@/components/SmsScheduler";
import { CustomSmsModal } from "@/components/CustomSmsModal";
import { Toast, type ToastType } from "@/components/Toast";
import { HERO_THEMES, HERO_PATTERNS } from "@/components/HeroThemeSwitcher";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { useRole } from "@/lib/auth/useRole";
import { ChangePasswordCard } from "@/components/ChangePasswordCard";
import {
  BuildingIcon,
  CalendarIcon,
  DocumentIcon,
  ListIcon,
  MailIcon,
  PaletteIcon,
  ShieldIcon,
  TaskIcon,
  UsersIcon,
  WalletIcon,
  WarningIcon,
} from "@/components/icons";
import {
  ChoiceTile,
  Field,
  SaveBar,
  SettingsCard,
  SettingsNav,
  type SettingsTab,
} from "@/components/settings/SettingsParts";
import type { SettingsInput } from "@/lib/settings/types";
import { PageTitle } from "@/components/PageTitle";
import { FinanceSettings } from "@/components/finance/FinanceSettings";
import { NavVisibility } from "@/components/settings/NavVisibility";
import { documentFont } from "@/lib/documentFont";

const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-[var(--field-border)] bg-[var(--field-bg)] px-3 text-sm text-[var(--ink-1)] transition-colors";

const PAYMENT_SMS_PLACEHOLDERS = [
  "client_name",
  "amount",
  "currency",
  "contract_number",
  "due_date",
];

const TASK_SMS_PLACEHOLDERS = ["assignee", "title", "due_date"];

type TabId = "company" | "appearance" | "menu" | "sms" | "finance" | "access" | "data";
const TAB_IDS: TabId[] = ["company", "appearance", "menu", "sms", "finance", "access", "data"];

const EMPTY: SettingsInput = {
  sms_provider: "",
  sms_api_key: "",
  sms_sender_name: "",
  sms_reminder_days: "",
  sms_payment_template: "",
  sms_due_today_template: "",
  sms_task_template: "",
  company_name: "",
  company_director: "",
  company_address: "",
  company_city: "",
  company_bank_details: "",
  company_logo_url: "",
  hero_theme: "atlas",
  hero_pattern: "none",
};

// A caption above a group of fields inside a card.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">
      {children}
    </p>
  );
}

// The three SMS templates used to be three identical grey boxes told apart
// only by the label text above them -- easy to edit the wrong one at a
// glance. Each has its own icon and tone (calendar/sky for the advance
// reminder, warning/amber for the day it's actually due, task/violet for
// staff reminders), so which message this is is visible before reading a
// word of it.
const TEMPLATE_TONES = {
  sky: {
    chip: "bg-[var(--wash-sky)] text-[var(--wash-sky-ink)]",
    ring: "focus:border-[var(--wash-sky-ink)] focus:ring-[var(--wash-sky)]",
  },
  amber: {
    chip: "bg-[var(--wash-amber)] text-[var(--wash-amber-ink)]",
    ring: "focus:border-[var(--wash-amber-ink)] focus:ring-[var(--wash-amber)]",
  },
  violet: {
    chip: "bg-[var(--wash-violet)] text-[var(--wash-violet-ink)]",
    ring: "focus:border-[var(--wash-violet-ink)] focus:ring-[var(--wash-violet)]",
  },
} as const;

function TemplateField({
  icon,
  tone,
  label,
  value,
  onChange,
  placeholders,
  rows = 3,
}: {
  icon: React.ReactNode;
  tone: keyof typeof TEMPLATE_TONES;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholders: string[];
  rows?: number;
}) {
  const c = TEMPLATE_TONES[tone];
  return (
    <div className="rounded-xl border border-[var(--border-c)] p-3">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${c.chip}`}>
          {icon}
        </span>
        <span className="text-sm font-semibold text-[var(--ink-2)]">{label}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`mt-2 w-full rounded-lg border border-[var(--field-border)] bg-[var(--field-bg)] px-3 py-2 font-mono text-xs text-[var(--ink-1)] transition-colors focus:outline-none focus:ring-2 ${c.ring}`}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {placeholders.map((p) => (
          <code key={p} className="rounded bg-[var(--track-c)] px-1.5 py-0.5 text-xs text-[var(--ink-3)]">
            {`{{${p}}}`}
          </code>
        ))}
      </div>
    </div>
  );
}

// How the company's own data will look at the top of a printed contract -- the
// point of most of these fields, so it is shown, not just described.
function LetterheadPreview({
  logo,
  name,
  address,
  city,
  title,
}: {
  logo: string;
  name: string;
  address: string;
  city: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-c)] bg-[var(--surface-2)] p-4">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">
        {title}
      </p>
      <div
        style={documentFont.style}
        className="rounded-lg bg-white p-4 text-[#18181b] shadow-sm ring-1 ring-black/5"
      >
        <div className="flex items-center gap-3 pb-2.5">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-11 w-11 shrink-0 object-contain" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-300">
              <BuildingIcon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-bold">
              {name ? `ҶДММ «${name}»` : "ҶДММ «…»"}
            </p>
            <p className="truncate text-[10px] text-slate-600">{address || "—"}</p>
          </div>
        </div>
        <div aria-hidden="true">
          <div style={{ borderTop: "2.5px solid var(--accent-yellow)" }} />
          <div className="mt-[2px]" style={{ borderTop: "0.75px solid #18181b" }} />
        </div>
        <div className="mt-2 flex items-baseline justify-between text-[11px]">
          <span className="font-bold">ш. {city || "…"}</span>
          <span className="text-slate-500">12.03.2026</span>
        </div>
      </div>
    </div>
  );
}

function SettingsView() {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const configured = isSupabaseConfigured();
  const { refresh } = useSettings();
  const { role, loading: roleLoading } = useRole();

  // The open section lives in the URL (?tab=sms), so a reload or a shared link
  // lands in the same place.
  const requested = searchParams.get("tab");
  const tab: TabId = TAB_IDS.includes(requested as TabId) ? (requested as TabId) : "company";
  const setTab = (id: TabId) => router.replace(`${pathname}?tab=${id}`, { scroll: false });

  const [values, setValues] = useState<SettingsInput>(EMPTY);
  // What is stored right now -- the form is "dirty" when it differs from this.
  const [saved, setSaved] = useState<SettingsInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  // Buildings for the "documentation PDF" picker.
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([]);
  const [reportBuilding, setReportBuilding] = useState("");

  useEffect(() => {
    if (role !== "admin" || !configured) return;
    const supabase = createClient();
    supabase
      .schema("crm")
      .from("buildings")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as Array<{ id: string; name: string }>;
        setBuildings(rows);
        setReportBuilding((prev) => prev || rows[0]?.id || "");
      });
  }, [role, configured]);

  // Loaded separately from the app-wide SettingsProvider, which deliberately
  // never fetches sms_api_key (it's mounted for every signed-in user
  // regardless of role) -- this page is the one place that needs the full
  // row, and it's only reachable by admins in the first place.
  useEffect(() => {
    if (role !== "admin" || !configured) return;
    const supabase = createClient();
    supabase
      .schema("crm")
      .from("settings")
      .select("*")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const loaded: SettingsInput = {
          sms_provider: data.sms_provider ?? "Payom.tj",
          sms_api_key: data.sms_api_key ?? "",
          sms_sender_name: data.sms_sender_name ?? "",
          sms_reminder_days: data.sms_reminder_days.toString(),
          sms_payment_template: data.sms_payment_template ?? "",
          sms_due_today_template: data.sms_due_today_template ?? "",
          sms_task_template: data.sms_task_template ?? "",
          company_name: data.company_name ?? "",
          company_director: data.company_director ?? "",
          company_address: data.company_address ?? "",
          company_city: data.company_city ?? "",
          company_bank_details: data.company_bank_details ?? "",
          company_logo_url: data.company_logo_url ?? "",
          hero_theme: data.hero_theme ?? "atlas",
          hero_pattern: data.hero_pattern ?? "none",
        };
        setValues(loaded);
        setSaved(loaded);
      });
  }, [role, configured]);

  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(saved), [values, saved]);

  const update = <K extends keyof SettingsInput>(key: K, value: SettingsInput[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  // Shared by the Save button and the SMS test-send button -- the test has
  // to hit the row that's actually stored (the API route reads it fresh via
  // the service client), so it saves first rather than testing whatever's
  // still sitting unsaved in the form.
  const saveSettings = async (): Promise<boolean> => {
    const supabase = createClient();
    const { error, data } = await supabase
      .schema("crm")
      .from("settings")
      .update({
        sms_provider: values.sms_provider || "Payom.tj",
        sms_api_key: values.sms_api_key || null,
        sms_sender_name: values.sms_sender_name || null,
        sms_reminder_days: values.sms_reminder_days ? Number(values.sms_reminder_days) : 3,
        sms_payment_template: values.sms_payment_template || null,
        sms_due_today_template: values.sms_due_today_template || null,
        sms_task_template: values.sms_task_template || null,
        company_name: values.company_name || null,
        company_director: values.company_director || null,
        company_address: values.company_address || null,
        company_city: values.company_city || null,
        company_bank_details: values.company_bank_details || null,
        company_logo_url: values.company_logo_url || null,
        hero_theme: values.hero_theme || null,
        hero_pattern: values.hero_pattern || null,
      })
      .eq("id", true)
      .select("id");
    if (error) {
      setToast({ message: error.message, type: "error" });
      return false;
    }
    if (!data || data.length === 0) {
      setToast({ message: t.settings.saveBlocked, type: "error" });
      return false;
    }
    setSaved(values);
    await refresh();
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveSettings();
    setSaving(false);
    if (ok) setToast({ message: t.settings.saved, type: "success" });
  };

  const handleTestSend = async () => {
    if (!testPhone.trim()) {
      setToast({ message: t.settings.sms.testNoPhone, type: "error" });
      return;
    }
    setTestSending(true);
    const ok = await saveSettings();
    if (!ok) {
      setTestSending(false);
      return;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ phone: testPhone }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setToast({ message: json.error || t.common.error, type: "error" });
      } else {
        setToast({ message: t.settings.sms.testSuccess, type: "success" });
      }
    } catch {
      setToast({ message: t.common.error, type: "error" });
    }
    setTestSending(false);
  };

  if (roleLoading) return <p className="text-[var(--ink-5)]">{t.common.loading}</p>;
  if (role !== "admin") {
    return (
      <div className="flex flex-col gap-3">
        <PageTitle>{t.settings.title}</PageTitle>
        <p className="text-[var(--ink-4)]">{t.users.accessDenied}</p>
      </div>
    );
  }

  const tabs: SettingsTab<TabId>[] = [
    { id: "company", label: t.settings.tabs.company, hint: t.settings.tabs.companyHint, icon: <BuildingIcon /> },
    { id: "appearance", label: t.settings.tabs.appearance, hint: t.settings.tabs.appearanceHint, icon: <PaletteIcon /> },
    { id: "menu", label: t.settings.tabs.menu, hint: t.settings.tabs.menuHint, icon: <ListIcon /> },
    { id: "sms", label: t.settings.tabs.sms, hint: t.settings.tabs.smsHint, icon: <MailIcon /> },
    { id: "finance", label: t.settings.tabs.finance, hint: t.settings.tabs.financeHint, icon: <WalletIcon /> },
    { id: "access", label: t.settings.tabs.access, hint: t.settings.tabs.accessHint, icon: <ShieldIcon /> },
    { id: "data", label: t.settings.tabs.data, hint: t.settings.tabs.dataHint, icon: <DocumentIcon /> },
  ];

  const activeTheme = HERO_THEMES.find((th) => th.id === values.hero_theme) ?? HERO_THEMES[0];
  const activePattern = HERO_PATTERNS.find((pt) => pt.id === values.hero_pattern) ?? HERO_PATTERNS[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <PageTitle>{t.settings.title}</PageTitle>
        <p className="text-sm text-[var(--ink-4)]">{t.settings.subtitle}</p>
      </div>

      {!configured && <SetupNotice />}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-7">
        <SettingsNav tabs={tabs} active={tab} onChange={setTab} />

        <div className="flex min-w-0 max-w-3xl flex-col gap-5">
          {/* ------------------------------------------------ company */}
          {tab === "company" && (
            <>
              <SettingsCard
                title={t.settings.company.title}
                hint={t.settings.company.hint}
                icon={<BuildingIcon />}
              >
                <FileUploadField
                  label={t.settings.company.logo}
                  value={values.company_logo_url}
                  onChange={(url) => update("company_logo_url", url)}
                  folder="company-logo"
                  uploadLabel={t.objects.form.upload}
                  uploadingLabel={t.objects.form.uploading}
                />
                <Field label={t.settings.company.name}>
                  <input
                    value={values.company_name}
                    onChange={(e) => update("company_name", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field label={t.settings.company.director} hint={t.settings.company.directorHint}>
                  <input
                    value={values.company_director}
                    onChange={(e) => update("company_director", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t.settings.company.city} hint={t.settings.company.cityPlaceholder}>
                    <input
                      value={values.company_city}
                      onChange={(e) => update("company_city", e.target.value)}
                      className={FIELD_CLASS}
                    />
                  </Field>
                  <Field label={t.settings.company.address}>
                    <input
                      value={values.company_address}
                      onChange={(e) => update("company_address", e.target.value)}
                      className={FIELD_CLASS}
                    />
                  </Field>
                </div>
                <Field label={t.settings.company.bankDetails}>
                  <textarea
                    value={values.company_bank_details}
                    onChange={(e) => update("company_bank_details", e.target.value)}
                    placeholder={t.settings.company.bankDetailsPlaceholder}
                    rows={3}
                    className="rounded-lg border border-[var(--field-border)] bg-[var(--field-bg)] px-3 py-2 text-sm text-[var(--ink-1)] transition-colors"
                  />
                </Field>
              </SettingsCard>
              <LetterheadPreview
                logo={values.company_logo_url}
                name={values.company_name}
                address={values.company_address}
                city={values.company_city}
                title={t.settings.previewTitle}
              />
            </>
          )}

          {/* ------------------------------------------------ appearance */}
          {tab === "appearance" && (
            <SettingsCard
              title={t.settings.appearance.title}
              hint={t.settings.appearance.hint}
              icon={<PaletteIcon />}
            >
              <div className="flex flex-col gap-2.5">
                <SectionLabel>{t.settings.appearance.theme}</SectionLabel>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {HERO_THEMES.map((th) => (
                    <ChoiceTile
                      key={th.id}
                      title={th.label}
                      selected={values.hero_theme === th.id}
                      onClick={() => update("hero_theme", th.id)}
                    >
                      <span
                        className="block h-16 rounded-lg"
                        style={{
                          // Лимӯ is flat, not a blend -- a real gradient
                          // swatch would misrepresent it. Hard colour stops
                          // give two solid bands: a thin lemon rule over
                          // graphite, the shape the real surfaces use.
                          background:
                            th.id === "lemon"
                              ? `linear-gradient(180deg, ${th.swatch[2]} 0%, ${th.swatch[2]} 15%, ${th.swatch[0]} 15%, ${th.swatch[0]} 100%)`
                              : `linear-gradient(120deg, ${th.swatch[0]}, ${th.swatch[1]} 55%, ${th.swatch[2]})`,
                        }}
                      />
                    </ChoiceTile>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <SectionLabel>{t.settings.appearance.pattern}</SectionLabel>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {HERO_PATTERNS.map((pt) => (
                    <ChoiceTile
                      key={pt.id}
                      title={pt.label}
                      selected={values.hero_pattern === pt.id}
                      onClick={() => update("hero_pattern", pt.id)}
                    >
                      <span
                        className="block h-16 rounded-lg border border-[var(--border-c)] bg-[var(--ink-4)]"
                        style={pt.css ? { backgroundImage: pt.css } : undefined}
                      />
                    </ChoiceTile>
                  ))}
                </div>
              </div>

              {/* The choice, together, on a strip that looks like the
                  dashboard header it will colour. */}
              <div
                className="relative overflow-hidden rounded-xl px-5 py-4 text-white"
                style={{
                  background:
                    activeTheme.id === "lemon"
                      ? `linear-gradient(180deg, ${activeTheme.swatch[2]} 0%, ${activeTheme.swatch[2]} 8%, ${activeTheme.swatch[0]} 8%, ${activeTheme.swatch[0]} 100%)`
                      : `linear-gradient(120deg, ${activeTheme.swatch[0]}, ${activeTheme.swatch[1]} 55%, ${activeTheme.swatch[2]})`,
                }}
              >
                {activePattern.css && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 opacity-[0.12]"
                    style={{ backgroundImage: activePattern.css }}
                  />
                )}
                <p className="relative text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
                  {t.dashboard.hero.salesProgress}
                </p>
                <p className="relative mt-1 text-3xl font-bold tabular-nums">
                  40 <span className="text-lg font-semibold opacity-60">/ 120</span>
                </p>
              </div>
            </SettingsCard>
          )}

          {/* ------------------------------------------------ sms */}
          {tab === "sms" && (
            <>
              <SettingsCard
                title={t.settings.sms.connectionSection}
                hint={t.settings.sms.hint}
                icon={<MailIcon />}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Честно, а не мелким шрифтом: переименование не переключает
                      шлюз. Запрос всегда уходит на gateway.payom.tj в его формате
                      (sendPaymentReminders.ts) -- это поле только для памяти
                      администратора, если ключ выдал именно этот провайдер. */}
                  <Field label={t.settings.sms.provider} hint={t.settings.sms.providerHint} className="sm:col-span-2">
                    <input
                      value={values.sms_provider}
                      onChange={(e) => update("sms_provider", e.target.value)}
                      placeholder="Payom.tj"
                      className={FIELD_CLASS}
                    />
                  </Field>
                  <Field label={t.settings.sms.apiKey}>
                    <input
                      type="password"
                      value={values.sms_api_key}
                      onChange={(e) => update("sms_api_key", e.target.value)}
                      className={`${FIELD_CLASS} font-mono`}
                    />
                  </Field>
                  <Field label={t.settings.sms.senderName}>
                    <input
                      value={values.sms_sender_name}
                      onChange={(e) => update("sms_sender_name", e.target.value)}
                      placeholder={t.settings.sms.senderNamePlaceholder}
                      className={FIELD_CLASS}
                    />
                  </Field>
                  <Field label={t.settings.sms.reminderDays}>
                    <input
                      type="number"
                      min="0"
                      value={values.sms_reminder_days}
                      onChange={(e) => update("sms_reminder_days", e.target.value)}
                      className={FIELD_CLASS}
                    />
                  </Field>
                </div>
              </SettingsCard>

              <SettingsCard title={t.settings.sms.templatesSection} icon={<CalendarIcon />}>
                <TemplateField
                  icon={<CalendarIcon className="h-4 w-4" />}
                  tone="sky"
                  label={t.settings.sms.paymentTemplateShort}
                  value={values.sms_payment_template}
                  onChange={(v) => update("sms_payment_template", v)}
                  placeholders={PAYMENT_SMS_PLACEHOLDERS}
                />
                {/* A separate message for the due date itself -- the rassylka
                    used to reuse the template above verbatim for both stages, so
                    the day-of SMS read "оплата ... до {{сегодняшняя дата}}"
                    instead of actually saying "сегодня". Amber, not sky: this
                    one goes out ON the due date, the more pressing of the two. */}
                <TemplateField
                  icon={<WarningIcon className="h-4 w-4" />}
                  tone="amber"
                  label={t.settings.sms.dueTodayTemplateShort}
                  value={values.sms_due_today_template}
                  onChange={(v) => update("sms_due_today_template", v)}
                  placeholders={PAYMENT_SMS_PLACEHOLDERS}
                />
                <TemplateField
                  icon={<TaskIcon className="h-4 w-4" />}
                  tone="violet"
                  label={t.settings.sms.taskTemplateShort}
                  value={values.sms_task_template}
                  onChange={(v) => update("sms_task_template", v)}
                  placeholders={TASK_SMS_PLACEHOLDERS}
                  rows={2}
                />
              </SettingsCard>

              {/* Compact inline test-send: one row, phone + button -- saves the
                  form first so the API key/sender it tests is exactly what's on
                  screen, then fires one real SMS through the gateway so a broken
                  key/sender surfaces immediately instead of days later when the
                  reminder cron happens to run. */}
              <SettingsCard title={t.settings.sms.testTitle} icon={<ListIcon />}>
                <div className="flex items-end gap-2">
                  <Field label={t.settings.sms.testPhone} className="flex-1">
                    <input
                      type="tel"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder={t.settings.sms.testPhonePlaceholder}
                      className={FIELD_CLASS}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={handleTestSend}
                    disabled={testSending}
                    className="btn btn-primary btn-md shrink-0"
                  >
                    {testSending ? t.settings.sms.testSending : t.settings.sms.testSend}
                  </button>
                </div>

                <div className="flex items-center gap-3 border-t border-[var(--border-c2)] pt-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--wash-sky)] text-[var(--wash-sky-ink)]">
                    <ListIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--ink-2)]">{t.settings.sms.broadcastRow}</p>
                    <p className="truncate text-xs text-[var(--ink-5)]">{t.settings.sms.broadcastRowHint}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBroadcast(true)}
                    className="btn btn-secondary btn-sm shrink-0"
                  >
                    {t.settings.sms.broadcastOpen}
                  </button>
                </div>

                {/* Start/Stop for the automatic run, plus why it can or can't go
                    out. Below the test-send: you prove one message works, then
                    switch the schedule on. */}
                <SmsScheduler
                  onMessage={(text, ok) => setToast({ message: text, type: ok ? "success" : "error" })}
                />
              </SettingsCard>
            </>
          )}

          {/* ------------------------------------------------ access */}
          {/* ------------------------------------------------ menu */}
          {tab === "menu" && (
            <SettingsCard title={t.settings.menu.title} hint={t.settings.menu.hint} icon={<ListIcon />}>
              <NavVisibility />
            </SettingsCard>
          )}

          {/* ------------------------------------------------ finance */}
          {tab === "finance" && (
            <SettingsCard
              title={t.finance.categories.title}
              hint={t.finance.categories.hint}
              icon={<WalletIcon />}
            >
              <FinanceSettings />
            </SettingsCard>
          )}

          {tab === "access" && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { href: "/settings/users", icon: <UsersIcon />, title: t.settings.usersLink, hint: t.settings.usersHint },
                  { href: "/settings/audit-log", icon: <ListIcon />, title: t.settings.auditLogLink, hint: t.settings.auditHint },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3 rounded-2xl border border-[var(--border-c)] bg-[var(--surface-1)] p-4 shadow-sm transition-all hover:border-[var(--accent-yellow)] hover:shadow-md"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#18181b] text-[var(--accent-yellow)] transition-colors group-hover:bg-[var(--accent-yellow)] group-hover:text-[#18181b] dark:bg-[var(--accent-yellow)] dark:text-[#18181b] [&_svg]:h-5 [&_svg]:w-5">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[var(--ink-1)]">{item.title}</span>
                      <span className="block text-xs text-[var(--ink-4)]">{item.hint}</span>
                    </span>
                    <span className="text-[var(--ink-5)] transition-transform group-hover:translate-x-0.5">→</span>
                  </Link>
                ))}
              </div>
              {configured && (
                <SettingsCard title={t.password.title} hint={t.password.hint} icon={<ShieldIcon />}>
                  <ChangePasswordCard bare />
                </SettingsCard>
              )}
            </>
          )}

          {/* ------------------------------------------------ data */}
          {tab === "data" && (
            <SettingsCard
              title={t.settings.backup.title}
              hint={t.settings.backup.hint}
              icon={<DocumentIcon />}
            >
              <div className="flex flex-wrap items-end gap-3">
                <Field label={t.settings.backup.select} className="min-w-52 max-w-sm flex-1">
                  <select
                    value={reportBuilding}
                    onChange={(e) => setReportBuilding(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    {buildings.length === 0 && <option value="">—</option>}
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Link
                  href={reportBuilding ? `/buildings/${reportBuilding}/report` : "#"}
                  aria-disabled={!reportBuilding}
                  className={`btn btn-primary btn-md ${
                    reportBuilding ? "" : "pointer-events-none opacity-40"
                  }`}
                >
                  <DocumentIcon className="h-4 w-4" /> {t.settings.backup.open}
                </Link>
              </div>
            </SettingsCard>
          )}

          <SaveBar
            dirty={dirty}
            saving={saving}
            message={t.settings.unsaved}
            saveLabel={saving ? t.common.loading : t.settings.save}
            discardLabel={t.common.cancel}
            onSave={handleSave}
            onDiscard={() => setValues(saved)}
          />
        </div>
      </div>

      <Toast
        message={toast?.message ?? null}
        type={toast?.type ?? "success"}
        onDismiss={() => setToast(null)}
      />

      {showBroadcast && (
        <CustomSmsModal
          onClose={() => setShowBroadcast(false)}
          onResult={(message, ok) => setToast({ message, type: ok ? "success" : "error" })}
        />
      )}
    </div>
  );
}

// useSearchParams needs a Suspense boundary so the page can still be
// prerendered.
export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
