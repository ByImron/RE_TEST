"use client";

import type { ReactNode } from "react";
import { CheckIcon } from "@/components/icons";

// Building blocks of the settings screen, kept in one place so every section
// looks like the same product: a navigation list, a titled card, a labelled
// field, and a save bar that only appears once something has changed.

export type SettingsTab<Id extends string> = {
  id: Id;
  label: string;
  hint: string;
  icon: ReactNode;
};

// Sections as a list on the left (a scrolling row of pills on a phone). The
// section you are in is dark with a yellow glyph -- the same "this one is on"
// look as a toggled toolbar control.
export function SettingsNav<Id extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: SettingsTab<Id>[];
  active: Id;
  onChange: (id: Id) => void;
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={on ? "page" : undefined}
            className={`group flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 lg:w-full ${
              on
                ? "border-[#18181b] bg-[#18181b] text-white shadow-sm dark:border-[var(--accent-yellow)] dark:bg-[var(--accent-yellow)] dark:text-[#18181b]"
                : "border-[var(--border-c)] bg-[var(--surface-1)] text-[var(--ink-2)] hover:border-[var(--accent-yellow)] hover:bg-[color-mix(in_srgb,var(--accent-yellow)_18%,var(--surface-1))]"
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-[17px] [&_svg]:w-[17px] ${
                on
                  ? "bg-white/10 text-[var(--accent-yellow)] dark:bg-black/10 dark:text-[#18181b]"
                  : "bg-[var(--hover-c2)] text-[var(--ink-3)]"
              }`}
            >
              {tab.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{tab.label}</span>
              <span
                className={`hidden truncate text-[11px] leading-tight lg:block ${
                  on ? "opacity-70" : "text-[var(--ink-5)]"
                }`}
              >
                {tab.hint}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// One titled block of settings.
export function SettingsCard({
  title,
  hint,
  icon,
  children,
  aside,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  children: ReactNode;
  /** Something to show at the right of the header (a status, a button). */
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border-c)] bg-[var(--surface-1)] shadow-sm">
      <header className="flex items-start gap-3 border-b border-[var(--border-c2)] px-5 py-4">
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#18181b] text-[var(--accent-yellow)] dark:bg-[var(--accent-yellow)] dark:text-[#18181b] [&_svg]:h-[18px] [&_svg]:w-[18px]">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-tight text-[var(--ink-1)]">{title}</h2>
          {hint && <p className="mt-0.5 text-xs leading-snug text-[var(--ink-4)]">{hint}</p>}
        </div>
        {aside}
      </header>
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
  );
}

// A labelled control with an optional explanation under it.
export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] font-semibold text-[var(--ink-2)]">{label}</span>
      {children}
      {hint && <span className="text-xs leading-snug text-[var(--ink-5)]">{hint}</span>}
    </label>
  );
}

// A choice tile (theme, pattern): selected = dark ring and a check.
export function ChoiceTile({
  selected,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex flex-col gap-2 rounded-xl border p-2 text-left transition-all duration-150 ${
        selected
          ? "border-[#18181b] shadow-sm ring-2 ring-[var(--accent-yellow)] dark:border-[var(--accent-yellow)]"
          : "border-[var(--border-c)] hover:border-[var(--accent-yellow)]"
      }`}
    >
      {children}
      <span className="flex items-center justify-between gap-2 px-0.5 text-xs font-semibold text-[var(--ink-2)]">
        {title}
        {selected && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#18181b] text-[var(--accent-yellow)] dark:bg-[var(--accent-yellow)] dark:text-[#18181b]">
            <CheckIcon className="h-3 w-3" />
          </span>
        )}
      </span>
    </button>
  );
}

// Slides up from the bottom of the screen once something differs from what is
// saved -- one Save for the whole page, and a way back.
export function SaveBar({
  dirty,
  saving,
  message,
  saveLabel,
  discardLabel,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  message: string;
  saveLabel: string;
  discardLabel: string;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-3 z-30 mt-2 flex justify-center">
      <div className="animate-modal-panel flex w-full max-w-xl flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--border-strong-c)] bg-[var(--surface-1)] px-4 py-3 shadow-xl">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-[var(--ink-2)]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-yellow)] ring-2 ring-[color-mix(in_srgb,var(--accent-yellow)_35%,transparent)]" />
          {message}
        </span>
        <button type="button" onClick={onDiscard} disabled={saving} className="btn btn-ghost btn-sm">
          {discardLabel}
        </button>
        <button type="button" onClick={onSave} disabled={saving} className="btn btn-primary btn-sm">
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
