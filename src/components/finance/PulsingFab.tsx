"use client";

import { LockIcon, PlusIcon } from "@/components/icons";

// The one "add" control on a phone: a yellow circle with a plus, ringed by two
// soft waves. It replaces a full-width slab that said the same thing in words
// (and sat next to the round button, so the screen offered the action twice).
// Position and size come from the caller (it differs per screen); the waves are
// separate elements, so the button itself never moves under the thumb.
//
// `locked` turns it into a quiet grey circle with a padlock and no waves: the
// action exists but is closed right now (no money to spend). Pressing it still
// does something -- the caller explains why -- instead of doing nothing.
export function PulsingFab({
  label,
  onClick,
  locked = false,
  className = "",
  size = "md",
}: {
  label: string;
  onClick: () => void;
  locked?: boolean;
  className?: string;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "h-16 w-16" : "h-14 w-14";
  const icon = size === "lg" ? "h-8 w-8" : "h-7 w-7";
  if (locked) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-disabled="true"
        className={`fixed z-30 flex ${box} touch-manipulation items-center justify-center rounded-full border border-[var(--border-strong-c)] bg-[var(--surface-2)] text-[var(--ink-4)] shadow-md transition-transform duration-150 active:scale-95 print:hidden ${className}`}
      >
        <LockIcon className="h-6 w-6" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`fab-halo fixed z-30 flex ${box} touch-manipulation items-center justify-center rounded-full bg-[var(--accent-yellow)] text-[#18181b] transition-transform duration-150 active:scale-95 print:hidden ${className}`}
    >
      <span aria-hidden="true" className="fab-wave pointer-events-none absolute inset-0 rounded-full bg-[var(--accent-yellow)]" />
      <span
        aria-hidden="true"
        className="fab-wave fab-wave-late pointer-events-none absolute inset-0 rounded-full bg-[var(--accent-yellow)]"
      />
      <PlusIcon className={`relative ${icon}`} />
    </button>
  );
}
