"use client";

import type { ReactNode } from "react";
import { documentFont } from "@/lib/documentFont";

// The one page heading. Larger, heavier and in the serif the sign-in screen and
// the printed documents use, so the name of the page you are on is the first
// thing the eye lands on -- the plain 24px semibold it replaced read as body
// text. A short yellow bar under it is the same mark the sign-in headline
// carries.
export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h1
        style={documentFont.style}
        className="text-[30px] font-bold leading-[1.1] tracking-tight text-[var(--ink-1)] sm:text-[36px]"
      >
        {children}
      </h1>
      <span aria-hidden="true" className="h-[3px] w-10 rounded-full bg-[var(--accent-yellow)]" />
    </div>
  );
}
