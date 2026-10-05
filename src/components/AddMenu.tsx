"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ControlGroup, IconAction } from "@/components/ActionBar";
import { PlusIcon } from "@/components/icons";

export function AddMenu({
  label,
  items,
}: {
  label: string;
  items: Array<{ href: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    // Same yellow "+" as the "add" action on every other list page, so the
    // header reads identically everywhere -- this one just opens a menu of
    // two destinations instead of navigating straight there.
    <div ref={containerRef} className="relative">
      <ControlGroup>
        <IconAction
          label={label}
          icon={<PlusIcon />}
          tone="primary"
          shortcut="N"
          onClick={() => setOpen((v) => !v)}
        />
      </ControlGroup>
      {open && (
        <div className="animate-modal-panel absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-lg border border-[var(--border-c)] bg-[var(--surface-1)] py-1 shadow-lg">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
