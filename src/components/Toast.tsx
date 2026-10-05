"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error";

// Two ways to say "done":
//  * a compact pill at the top centre for everyday confirmations (saved,
//    payment taken) -- it slides in above the page and gets out of the way;
//  * a card in the middle of the screen (`prominent`) for things that change
//    the data for good or take something away (a booking cancelled, a cell
//    deleted, clients merged) -- big enough that it cannot be missed, but it
//    never blocks the page: clicks go through the dimmed backdrop.
const DURATION_MS = 3500;
const PROMINENT_DURATION_MS = 3000;

// Success follows the company theme: `.btn-brand` is the same surface the
// primary buttons use (brand gradient, flat graphite in Лимӯ, yellow with dark
// ink in the dark theme). An error stays red in every theme -- it is a
// warning, not decoration, and in Шафақ (a pink brand) a different hue plus
// the triangle keeps it from reading as a success.
const OK_SURFACE = "btn-brand text-white";
const ERROR_SURFACE = "bg-red-700 text-white dark:bg-red-600";

export function Toast({
  message,
  type,
  prominent = false,
  onDismiss,
}: {
  message: string | null;
  type: ToastType;
  prominent?: boolean;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const duration = prominent ? PROMINENT_DURATION_MS : DURATION_MS;

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    let removal: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setVisible(false);
      removal = setTimeout(onDismiss, 300);
    }, duration);
    return () => {
      clearTimeout(timer);
      clearTimeout(removal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message) return null;

  const isSuccess = type === "success";
  const dismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  const icon = isSuccess ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[55%] w-[55%]" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[55%] w-[55%]" aria-hidden="true">
      <path d="M12 4 2.8 19.5h18.4L12 4Z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </svg>
  );

  // Countdown line -- keyed by message so the animation restarts for each new
  // toast instead of continuing a stale one.
  const countdown = (
    <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/10">
      {visible && (
        <div
          key={message}
          className="h-full origin-left bg-current opacity-60"
          style={{ animation: `toast-countdown ${duration}ms linear forwards` }}
        />
      )}
    </div>
  );

  if (prominent) {
    return (
      // No `inset-0` here on purpose: the keyboard shortcuts treat any
      // full-screen fixed layer as an open dialog and switch off.
      <div
        className={`pointer-events-none fixed left-0 top-0 z-[70] flex h-full w-full items-center justify-center p-4 transition-colors duration-300 ${
          visible ? "bg-black/35" : "bg-black/0"
        }`}
      >
        <div
          role="status"
          onClick={dismiss}
          className={`pointer-events-auto relative flex w-full max-w-xs cursor-pointer flex-col items-center gap-4 overflow-hidden rounded-3xl bg-[var(--surface-1)] px-8 pb-9 pt-8 text-center shadow-2xl ring-1 ring-black/5 transition-all duration-300 ${
            visible ? "scale-100 opacity-100" : "scale-90 opacity-0"
          }`}
          style={{ transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        >
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full shadow-md ${
              isSuccess ? OK_SURFACE : ERROR_SURFACE
            }`}
          >
            {icon}
          </span>
          <p className="text-base font-semibold leading-snug text-[var(--ink-1)]">{message}</p>
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--hover-c2)]">
            {visible && (
              <div
                key={message}
                className={`h-full origin-left ${isSuccess ? "bg-brand" : "bg-red-600"}`}
                style={{ animation: `toast-countdown ${duration}ms linear forwards` }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[70] flex justify-center px-4">
      <div
        role="status"
        className={`pointer-events-auto relative flex max-w-full items-center gap-3 overflow-hidden rounded-full py-2 pl-2 pr-2 shadow-xl transition-all duration-300 ${
          isSuccess ? OK_SURFACE : ERROR_SURFACE
        } ${visible ? "translate-y-0 scale-100 opacity-100" : "-translate-y-4 scale-95 opacity-0"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/25">
          {icon}
        </span>
        <span className="min-w-0 py-0.5 pr-1 text-sm font-semibold leading-snug">{message}</span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="×"
          className="shrink-0 rounded-full px-2 py-1 text-base leading-none opacity-70 transition-opacity hover:opacity-100"
        >
          ×
        </button>
        {countdown}
      </div>
    </div>
  );
}
