"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useRole } from "@/lib/auth/useRole";
import { useConfirm } from "@/components/ConfirmDialog";
import { useSingleFlight } from "@/lib/useSingleFlight";
import { Modal } from "@/components/Modal";
import { CheckIcon, CloseIcon, MergeIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { presetRenames, type NameLanguage } from "@/lib/finance/defaultNames";
import { categoryLabel, type FinanceCategory, type FinanceKind } from "@/lib/finance/types";
import { useFinance } from "@/components/finance/FinanceContext";

const FIELD =
  "h-[38px] min-w-0 flex-1 rounded-lg border border-[var(--field-border)] bg-[var(--field-bg)] px-3 text-sm text-[var(--ink-1)] transition-colors";

// New categories go after the ones already there but before the catch-all
// "other" (sort 99) the seed puts last.
function nextSort(items: FinanceCategory[]): number {
  return items.reduce((m, c) => (c.sort < 99 ? Math.max(m, c.sort) : m), 0) + 1;
}

// The company's own list of income and expense categories: create, rename
// (any of them, the standard ones too), hide, merge duplicates. Renaming and
// hiding never delete anything -- a hidden category leaves the pickers but
// stays on the entries that already use it, so an old entry never loses its
// category. Merging is the one thing that does delete a row: it moves every
// entry off the duplicate onto the category you keep, then removes the
// duplicate -- for when a category was typed twice (often in both languages,
// before the presets below existed) rather than just renamed wrong. Used both
// in a dialog (Finance) and inline (Settings -> Финансы, which also offers
// the language presets).
export function CategoriesEditor({
  categories,
  onChanged,
  hideHint = false,
  showPresets = false,
}: {
  categories: FinanceCategory[];
  onChanged: () => void;
  /** The surrounding card already carries the explanation. */
  hideHint?: boolean;
  /** Offer "standard names in Russian / Tajik". */
  showPresets?: boolean;
}) {
  const { t } = useLocale();
  const { role } = useRole();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (op: PromiseLike<{ error: { message: string } | null }>) => {
    const { error: dbError } = await op;
    if (dbError) {
      setError(dbError.message);
      return false;
    }
    setError(null);
    onChanged();
    return true;
  };
  const table = () => createClient().schema("crm").from("finance_categories");

  const applyPreset = async (target: NameLanguage) => {
    const renames = presetRenames(categories, target);
    if (renames.length === 0) return;
    setBusy(true);
    const results = await Promise.all(renames.map((r) => table().update({ name: r.name }).eq("id", r.id)));
    setBusy(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) setError(failed.error.message);
    else setError(null);
    onChanged();
  };

  const merge = async (from: FinanceCategory, intoId: string) => {
    const { error: rpcError } = await createClient()
      .schema("crm")
      .rpc("finance_merge_category", { p_from: from.id, p_into: intoId });
    if (rpcError) {
      setError(rpcError.message);
      return false;
    }
    setError(null);
    onChanged();
    return true;
  };

  return (
    <div className="flex flex-col gap-4">
      {showPresets && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-c)] bg-[var(--surface-2)] px-4 py-3">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-sm font-semibold text-[var(--ink-1)]">{t.finance.categories.presetsTitle}</p>
            <p className="text-xs leading-snug text-[var(--ink-4)]">{t.finance.categories.presetsHint}</p>
          </div>
          <button
            type="button"
            disabled={busy || presetRenames(categories, "ru").length === 0}
            onClick={() => void applyPreset("ru")}
            className="btn btn-secondary btn-sm"
          >
            {t.finance.categories.presetRu}
          </button>
          <button
            type="button"
            disabled={busy || presetRenames(categories, "tj").length === 0}
            onClick={() => void applyPreset("tj")}
            className="btn btn-secondary btn-sm"
          >
            {t.finance.categories.presetTj}
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {(["expense", "income"] as const).map((kind) => (
          <Column
            key={kind}
            kind={kind}
            items={categories.filter((c) => c.kind === kind)}
            canMerge={role === "admin"}
            onAdd={(name) =>
              run(table().insert({ kind, name, sort: nextSort(categories.filter((c) => c.kind === kind)) }))
            }
            onRename={(c, name) => run(table().update({ name }).eq("id", c.id))}
            onToggle={(c) => run(table().update({ archived: !c.archived }).eq("id", c.id))}
            onMerge={merge}
            onDelete={(c) => run(table().delete().eq("id", c.id))}
            onError={setError}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-[var(--wash-rose)] px-3 py-2 text-sm text-[var(--wash-rose-ink)]">
          {error}
        </p>
      )}
      {!hideHint && <p className="text-xs leading-snug text-[var(--ink-5)]">{t.finance.categories.hint}</p>}
    </div>
  );
}

export function CategoriesModal({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const { categories, reloadCategories } = useFinance();
  return (
    <Modal title={t.finance.categories.title} onClose={onClose} size="lg">
      <CategoriesEditor categories={categories} onChanged={reloadCategories} />
    </Modal>
  );
}

function Column({
  kind,
  items,
  canMerge,
  onAdd,
  onRename,
  onToggle,
  onMerge,
  onDelete,
  onError,
}: {
  kind: FinanceKind;
  items: FinanceCategory[];
  /** Only an admin can merge -- crm.finance_merge_category() enforces the same. */
  canMerge: boolean;
  onAdd: (name: string) => Promise<boolean>;
  onRename: (c: FinanceCategory, name: string) => Promise<boolean>;
  onToggle: (c: FinanceCategory) => Promise<boolean>;
  onMerge: (from: FinanceCategory, intoId: string) => Promise<boolean>;
  onDelete: (c: FinanceCategory) => Promise<boolean>;
  onError: (message: string | null) => void;
}) {
  const { t } = useLocale();
  const confirm = useConfirm();
  const once = useSingleFlight();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [merging, setMerging] = useState<{ id: string; target: string; count: number | null } | null>(null);

  const commit = async (c: FinanceCategory) => {
    if (!editing) return;
    const value = editing.value.trim();
    if (!value || value === c.name) {
      setEditing(null);
      return;
    }
    if (await onRename(c, value)) setEditing(null);
  };

  const startMerge = (c: FinanceCategory) => {
    setMerging({ id: c.id, target: "", count: null });
    createClient()
      .schema("crm")
      .from("finance_entries")
      .select("id", { count: "exact", head: true })
      .eq("category_id", c.id)
      .then(({ count }) => setMerging((m) => (m && m.id === c.id ? { ...m, count: count ?? 0 } : m)));
  };

  // Only a category nothing is booked against can go -- an entry never loses
  // its category. Otherwise say so and point at hide / merge instead.
  const doDelete = async (c: FinanceCategory) => {
    const { count } = await createClient()
      .schema("crm")
      .from("finance_entries")
      .select("id", { count: "exact", head: true })
      .eq("category_id", c.id);
    if ((count ?? 0) > 0) {
      onError(t.finance.categories.deleteUsed.replace("{n}", String(count)));
      return;
    }
    const ok = await confirm(t.finance.categories.deleteConfirm.replace("{name}", c.name), {
      danger: true,
      confirmLabel: t.common.confirmDeleteBtn,
    });
    if (ok) await onDelete(c);
  };

  const doMerge = async (c: FinanceCategory) => {
    if (!merging || merging.id !== c.id || !merging.target) return;
    const target = items.find((x) => x.id === merging.target);
    if (!target) return;
    const ok = await confirm(
      t.finance.categories.mergeConfirm
        .replace("{name}", c.name)
        .replace("{target}", target.name)
        .replace("{n}", String(merging.count ?? 0)),
      { danger: true, confirmLabel: t.finance.categories.mergeConfirmButton }
    );
    if (!ok) return;
    if (await onMerge(c, merging.target)) setMerging(null);
  };

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${kind === "income" ? "bg-emerald-500" : "bg-rose-500"}`}
        />
        {kind === "income" ? t.finance.income : t.finance.expense}
      </h3>
      <ul className="flex flex-col divide-y divide-[var(--border-c2)] rounded-xl border border-[var(--border-c)] bg-[var(--surface-1)]">
        {items.map((c) => {
          const system = c.code === "contract_payments";
          const isEditing = editing?.id === c.id;
          const isMerging = merging?.id === c.id;
          const mergeTargets = items.filter((x) => x.id !== c.id && x.code === null);
          return (
            <li key={c.id} className="flex flex-col gap-1.5 px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      value={editing.value}
                      aria-label={t.finance.categories.rename}
                      onChange={(e) => setEditing({ id: c.id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commit(c);
                        }
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setEditing(null);
                        }
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] px-2 text-sm text-[var(--ink-1)]"
                    />
                    <button
                      type="button"
                      onClick={() => void commit(c)}
                      aria-label={t.finance.categories.save}
                      title={t.finance.categories.save}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#18181b] text-[var(--accent-yellow)] transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b] dark:bg-[var(--accent-yellow)] dark:text-[#18181b]"
                    >
                      <CheckIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      aria-label={t.common.cancel}
                      title={t.common.cancel}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--ink-4)] transition-colors hover:bg-[var(--hover-c2)]"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className={`min-w-0 flex-1 truncate px-1.5 py-1 text-sm ${
                        c.archived ? "text-[var(--ink-5)] line-through" : "text-[var(--ink-2)]"
                      }`}
                      title={system ? t.finance.categories.systemHint : undefined}
                    >
                      {categoryLabel(c, t.finance.categories.contractPayments, c.name)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing({ id: c.id, value: c.name })}
                      aria-label={`${t.finance.categories.rename}: ${c.name}`}
                      title={t.finance.categories.rename}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--ink-4)] transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                    {canMerge && !system && mergeTargets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => startMerge(c)}
                        aria-label={`${t.finance.categories.merge}: ${c.name}`}
                        title={t.finance.categories.merge}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--ink-4)] transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
                      >
                        <MergeIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!system && (
                      <button
                        type="button"
                        onClick={once(() => doDelete(c))}
                        aria-label={`${t.finance.categories.delete}: ${c.name}`}
                        title={t.finance.categories.delete}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--ink-4)] transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!system && (
                      <button
                        type="button"
                        onClick={() => void onToggle(c)}
                        className="shrink-0 rounded-md px-1.5 py-1 text-xs font-semibold text-[var(--ink-4)] transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
                      >
                        {c.archived ? t.finance.categories.show : t.finance.categories.hide}
                      </button>
                    )}
                  </>
                )}
              </div>
              {isMerging && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[var(--surface-2)] p-1.5">
                  <select
                    autoFocus
                    aria-label={t.finance.categories.mergeInto}
                    value={merging.target}
                    onChange={(e) => setMerging({ ...merging, target: e.target.value })}
                    className="h-8 min-w-0 flex-1 rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] px-2 text-sm text-[var(--ink-1)]"
                  >
                    <option value="" disabled>
                      {t.finance.categories.mergeInto}
                    </option>
                    {mergeTargets.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={once(() => doMerge(c))}
                    disabled={!merging.target || merging.count === null}
                    aria-label={t.finance.categories.mergeConfirmButton}
                    title={t.finance.categories.mergeConfirmButton}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#18181b] text-[var(--accent-yellow)] transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b] disabled:opacity-50 dark:bg-[var(--accent-yellow)] dark:text-[#18181b]"
                  >
                    <MergeIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMerging(null)}
                    aria-label={t.common.cancel}
                    title={t.common.cancel}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--ink-4)] transition-colors hover:bg-[var(--hover-c2)]"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                  <p className="w-full text-xs text-[var(--ink-5)]">
                    {merging.count === null
                      ? t.common.loading
                      : t.finance.categories.mergeCount.replace("{n}", String(merging.count))}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const value = name.trim();
          if (!value) return;
          if (await onAdd(value)) setName("");
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.finance.categories.newPlaceholder}
          className={FIELD}
        />
        <button
          type="submit"
          disabled={!name.trim()}
          aria-label={t.finance.categories.add}
          title={t.finance.categories.add}
          className="btn btn-primary btn-md shrink-0 px-3"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
