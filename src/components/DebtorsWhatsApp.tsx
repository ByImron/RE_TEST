"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { formatCurrency } from "@/lib/currency";
import { Modal } from "@/components/Modal";
import { IconAction } from "@/components/ActionBar";
import { CheckIcon, WhatsAppIcon } from "@/components/icons";
import { fetchAllDebtors, type ContractDebt, type DebtSortKey } from "@/lib/debtors/debtors";
import { groupForWhatsApp, type WhatsAppRecipient } from "@/lib/debtors/reminder";

// Everyone reuses ONE window: each next chat replaces the previous one instead of
// piling up a tab per debtor. (Not opened with "noopener" on purpose -- that would
// make every chat a new window. The target is WhatsApp's own address.)
const CHAT_WINDOW = "wa-debtors";

const today = () => new Date().toISOString().slice(0, 10);

// Which chats were already opened today under this filter, kept for the tab's
// life only: closing the dialog, or a refresh, must not send you back to the first
// debtor and have you message the same people twice.
function readOpened(key: string): string[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeOpened(key: string, value: string[]) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private window / storage blocked: the progress just lives in this dialog
  }
}

// "Message all debtors in WhatsApp". WhatsApp does not let a web page send a
// message on its own -- only a registered business account can do that through its
// paid API -- so this does everything up to the last tap: it reads the whole list,
// writes each person's message, and opens their chat with the text already in
// it, one after another; in the chat only "Send" is left.
// An icon in the toolbar's own bordered box, named on hover like its neighbours.
export function WhatsAppAllAction({ buildingId, sort }: { buildingId: string; sort: DebtSortKey }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconAction label={t.debtors.wa.button} icon={<WhatsAppIcon />} onClick={() => setOpen(true)} />
      {open && <WhatsAppRound buildingId={buildingId} sort={sort} onClose={() => setOpen(false)} />}
    </>
  );
}

function WhatsAppRound({
  buildingId,
  sort,
  onClose,
}: {
  buildingId: string;
  sort: DebtSortKey;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const storeKey = `debtors-wa:${today()}:${buildingId}`;
  const [debts, setDebts] = useState<ContractDebt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<string[]>(() => readOpened(storeKey));
  const [showNoPhone, setShowNoPhone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllDebtors(createClient(), { buildingId, sort })
      .then((list) => {
        if (!cancelled) setDebts(list);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [buildingId, sort]);

  const { recipients, withoutPhone } = useMemo(
    () => (debts ? groupForWhatsApp(debts, t) : { recipients: [], withoutPhone: [] }),
    [debts, t]
  );

  const isOpened = (r: WhatsAppRecipient) => opened.includes(r.phone);
  const nextIndex = recipients.findIndex((r) => !isOpened(r));
  const next = nextIndex >= 0 ? recipients[nextIndex] : null;
  const doneCount = recipients.filter(isOpened).length;

  const openChat = (r: WhatsAppRecipient) => {
    window.open(r.url, CHAT_WINDOW);
    const updated = opened.includes(r.phone) ? opened : [...opened, r.phone];
    setOpened(updated);
    writeOpened(storeKey, updated);
  };

  const restart = () => {
    setOpened([]);
    writeOpened(storeKey, []);
  };

  const contracts = recipients.reduce((sum, r) => sum + r.debts.length, 0);
  const money = (r: WhatsAppRecipient) =>
    r.debts.map((d) => formatCurrency(d.totalOverdue, d.currency)).join(" + ");

  return (
    <Modal title={t.debtors.wa.title} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-snug text-[var(--ink-3)]">{t.debtors.wa.intro}</p>

        {!debts && !error && <p className="py-6 text-center text-sm text-[var(--ink-5)]">{t.common.loading}</p>}
        {error && (
          <p role="alert" className="rounded-lg bg-[var(--wash-rose)] px-4 py-3 text-sm text-[var(--wash-rose-ink)]">
            {t.debtors.wa.loadFailed.replace("{error}", error)}
          </p>
        )}

        {debts && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [t.debtors.wa.recipients, recipients.length],
                [t.debtors.wa.contracts, contracts],
                [t.debtors.wa.withoutPhone, withoutPhone.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-[var(--hover-c2)] px-2 py-2.5">
                  <p className="text-xl font-bold leading-none tabular-nums text-[var(--ink-1)]">{value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">{label}</p>
                </div>
              ))}
            </div>

            {recipients.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border-c)] px-4 py-6 text-center text-sm text-[var(--ink-4)]">
                {t.debtors.wa.none}
              </p>
            ) : (
              <>
                {/* The text that goes to whoever is next -- seen before it is sent. */}
                {next && (
                  <div className="rounded-xl border border-[var(--wash-emerald-border)] bg-[var(--wash-emerald)] px-4 py-3 text-[var(--wash-emerald-ink)]">
                    <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                      {t.debtors.wa.preview} — {next.name}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-snug">{next.text}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {next ? (
                    <button
                      type="button"
                      onClick={() => openChat(next)}
                      className="btn btn-primary btn-lg w-full"
                    >
                      <WhatsAppIcon className="h-5 w-5" />
                      {(doneCount === 0 ? t.debtors.wa.start : t.debtors.wa.next).replace("{name}", next.name)}
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--wash-emerald)] px-4 py-3 text-sm font-semibold text-[var(--wash-emerald-ink)]">
                      <span className="inline-flex items-center gap-2">
                        <CheckIcon className="h-4 w-4" />
                        {t.debtors.wa.done}
                      </span>
                      <button type="button" onClick={restart} className="btn btn-secondary btn-sm">
                        {t.debtors.wa.again}
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--track-c)]">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                        style={{ width: `${(doneCount / recipients.length) * 100}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--ink-4)]">
                      {t.debtors.wa.progress.replace("{done}", String(doneCount)).replace("{total}", String(recipients.length))}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ink-5)]">{t.debtors.wa.popupHint}</p>
                </div>

                <ul className="max-h-56 divide-y divide-[var(--border-c2)] overflow-y-auto rounded-xl border border-[var(--border-c)]">
                  {recipients.map((r) => (
                    <li key={r.phone} className="flex items-center gap-3 px-3 py-2">
                      <span
                        aria-hidden="true"
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          isOpened(r)
                            ? "bg-emerald-500 text-white"
                            : "border border-[var(--border-strong-c)] text-transparent"
                        }`}
                      >
                        <CheckIcon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--ink-1)]">{r.name}</p>
                        <p className="truncate text-xs tabular-nums text-[var(--ink-5)]">
                          +{r.phone} · {money(r)}
                          {r.debts.length > 1 ? ` · ${r.debts.length} ${t.debtors.wa.contractsShort}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openChat(r)}
                        className="btn btn-secondary btn-sm shrink-0"
                        aria-label={`${t.debtors.wa.open}: ${r.name}`}
                      >
                        {isOpened(r) ? t.debtors.wa.openAgain : t.debtors.wa.open}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {withoutPhone.length > 0 && (
              <div className="text-xs text-[var(--ink-4)]">
                <button
                  type="button"
                  onClick={() => setShowNoPhone((v) => !v)}
                  aria-expanded={showNoPhone}
                  className="font-semibold underline decoration-dotted underline-offset-2"
                >
                  {t.debtors.wa.withoutPhoneHint.replace("{n}", String(withoutPhone.length))}
                </button>
                {showNoPhone && (
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {withoutPhone.map((d) => (
                      <li key={d.contractId}>
                        {d.clientName}
                        {d.contractNumber ? ` · №${d.contractNumber}` : ""}
                        {d.clientPhone ? ` · ${d.clientPhone}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="border-t border-[var(--border-c2)] pt-3 text-xs leading-snug text-[var(--ink-5)]">
              {t.debtors.wa.introWhy}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
