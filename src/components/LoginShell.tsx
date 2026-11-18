"use client";

import { useEffect, useState, type FormEventHandler, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { documentFont } from "@/lib/documentFont";

// Field / label / link styles shared by the sign-in and reset-password forms.
// The form sits on a fixed paper-white panel (not themed light/dark), so the
// fields are fixed too. Focus is the Лимӯ yellow the rest of the screen uses.
export const LOGIN_FIELD =
  "h-12 w-full rounded-[6px] border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 transition-colors focus:border-[#18181b] focus:outline-none focus:ring-2 focus:ring-[var(--accent-yellow)]";
export const LOGIN_LABEL = "text-[13px] font-semibold text-slate-700";
export const LOGIN_LINK =
  "self-start rounded text-[13px] text-slate-600 underline underline-offset-4 transition-colors hover:text-slate-900 disabled:opacity-50";

// Near-black of the brand panel, and the yellow drawn on it. Fixed rather than
// taken from the company's theme: black and yellow is this screen's identity,
// and the company's own name and logo carry the branding on top of it.
const PANEL = "#121214";
const YELLOW = "var(--accent-yellow)";

// A building elevation drawn as thin architectural lines. Only lines -- no
// lettering -- so it reads the same in Russian and Tajik.
function Blueprint({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 560 420"
      fill="none"
      stroke={YELLOW}
      strokeOpacity={0.4}
      strokeWidth={1}
      aria-hidden="true"
      className={className}
    >
      <path d="M40 400H540" />
      <rect x="150" y="70" width="260" height="330" />
      <path d="M150 120H410M150 170H410M150 220H410M150 270H410M150 320H410M150 360H410" strokeOpacity={0.7} />
      <path d="M200 70V400M250 70V400M300 70V400M350 70V400" strokeOpacity={0.5} />
      <rect x="255" y="360" width="50" height="40" />
      <path d="M150 70L280 30L410 70" />
      <path d="M120 70V400" strokeDasharray="3 4" />
      <path d="M114 70H126M114 400H126" />
      <path d="M150 424H410" strokeDasharray="3 4" />
      <path d="M150 418V430M410 418V430" />
      <path d="M440 400V300M434 300H446" strokeOpacity={0.5} />
      <path d="M470 400V210M464 210H476" strokeOpacity={0.4} />
    </svg>
  );
}

function FeatureIcon({ kind }: { kind: "chess" | "contract" | "payment" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={YELLOW}
      strokeWidth={1.5}
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden="true"
    >
      {kind === "chess" && (
        <>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </>
      )}
      {kind === "contract" && (
        <>
          <path d="M6 3h9l4 4v14H6z" />
          <path d="M14 3v5h5M9 13h7M9 17h7" />
        </>
      )}
      {kind === "payment" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v10M9 10c0-1.5 6-1.5 6 0s-6 2-6 4 6 1.5 6 0" />
        </>
      )}
    </svg>
  );
}

// The whole sign-in screen minus its form: a black panel with the company's
// name and logo, what the system does and a drawn building; and a paper panel
// where the form goes. Shared by /login and /reset-password. On a phone the
// black panel shrinks to a header band (name + headline) above the form.
export function LoginShell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useLocale();
  const configured = isSupabaseConfigured();
  // Company branding. This page runs before auth, and full settings are
  // staff-only -- public_branding() (026) exposes exactly the name and logo,
  // nothing else. Falls back to the app name until the RPC answers (or if the
  // migration isn't applied yet).
  const [brand, setBrand] = useState<{ name: string | null; logo: string | null }>({
    name: null,
    logo: null,
  });

  useEffect(() => {
    if (!configured) return;
    createClient()
      .schema("crm")
      .rpc("public_branding")
      .then(({ data }) => {
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setBrand({ name: row.company_name ?? null, logo: row.company_logo_url ?? null });
        }
      });
  }, [configured]);

  const displayName = brand.name || t.appName;
  const features = [
    { kind: "chess", title: t.login.featureChessTitle, text: t.login.featureChessText },
    { kind: "contract", title: t.login.featureContractsTitle, text: t.login.featureContractsText },
    { kind: "payment", title: t.login.featurePaymentsTitle, text: t.login.featurePaymentsText },
  ] as const;

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-[#fbfbf9] text-[#14181c] lg:grid-cols-[1.12fr_0.88fr] lg:grid-rows-1">
      <aside
        style={{
          backgroundColor: PANEL,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        className="relative flex flex-col justify-between gap-6 overflow-hidden px-6 py-6 text-white lg:px-14 lg:py-12"
      >
        <Blueprint className="pointer-events-none absolute -right-3.5 top-2.5 hidden w-[64%] max-w-[440px] lg:block" />

        <div className="relative flex items-center gap-3.5">
          {brand.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logo}
              alt=""
              className="h-11 w-11 shrink-0 rounded-[10px] bg-white object-contain p-1"
            />
          ) : (
            brand.name && (
              <span
                aria-hidden="true"
                style={documentFont.style}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-yellow)] text-[22px] font-bold text-[#18181b]"
              >
                {brand.name.trim().charAt(0)}
              </span>
            )
          )}
          <p style={documentFont.style} className="min-w-0 truncate text-[19px] font-semibold">
            {displayName}
          </p>
        </div>

        <div className="relative">
          <div className="mb-4 h-0.5 w-10 bg-[var(--accent-yellow)]" aria-hidden="true" />
          <p
            style={documentFont.style}
            className="max-w-[14em] text-balance text-[clamp(24px,3.4vw,44px)] font-semibold leading-[1.12] tracking-tight"
          >
            {t.login.headline}
          </p>
          <ul className="mt-6 hidden max-w-[25em] lg:block">
            {features.map((f) => (
              <li
                key={f.kind}
                className="flex items-center gap-3.5 border-t border-white/20 py-3 text-[14.5px] text-white/90"
              >
                <FeatureIcon kind={f.kind} />
                <span>
                  <b className="font-semibold text-white">{f.title}</b> — {f.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="relative flex justify-center px-6 pb-8 pt-8 sm:px-10 lg:px-14 lg:py-12">
        {/* One column for everything on this side: the language switch, the form
            and the credit line share the same left and right edge, and the
            column sits in the middle of the panel instead of hugging the left. */}
        <div className="flex w-full max-w-[400px] flex-col">
          {/* The person picking РУ/ТҶ hasn't logged in yet, so the sign-in screen
              itself has to offer the choice. */}
          <div className="flex justify-end">
            <div className="flex overflow-hidden rounded-lg ring-1 ring-inset ring-slate-300">
              {(["ru", "tj"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  aria-pressed={locale === l}
                  className={`px-2.5 py-1 text-xs font-bold transition-colors ${
                    locale === l
                      ? "bg-[#18181b] text-[var(--accent-yellow)]"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {l === "ru" ? "Ру" : "Тҷ"}
                </button>
              ))}
            </div>
          </div>

          <div className="my-auto w-full py-10 sm:py-12">{children}</div>

          <p className="text-xs tracking-wide text-slate-500">
            developed by{" "}
            <a
              href="https://www.instagram.com/iammirzozoda"
              target="_blank"
              rel="noopener noreferrer"
              className="-mx-1.5 rounded px-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              IMRON
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}

export function LoginCard({
  onSubmit,
  children,
}: {
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5">
      {children}
    </form>
  );
}

// Form heading: the serif the printed contract uses, so the first thing a
// person sees and the last thing they print are set in the same face.
export function LoginHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 style={documentFont.style} className="text-[30px] font-semibold leading-[1.15] tracking-tight">
        {title}
      </h1>
      {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
    </div>
  );
}
