"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { createClient } from "@/lib/supabase/client";
import { useSettings } from "@/lib/settings/SettingsProvider";
import { useAuth } from "@/lib/auth/useRole";
import { canView, isOwnOnly } from "@/lib/auth/access";
import { OfflineBanner } from "@/components/OfflineBanner";
import { QuickSearch } from "@/components/QuickSearch";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PinLock } from "@/components/PinLock";
import { SessionGuard } from "@/components/SessionGuard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { applyHeroTheme } from "@/components/HeroThemeSwitcher";
import type { Locale } from "@/lib/i18n/dictionaries";

// No "Договоры" item: the contracts list duplicated what the client card
// already does better (find the contract, print it, take a payment, see
// history). Contract detail pages stay reachable from client cards and
// the shakhmatka.
// Outline icons, not emoji: same stroke weight everywhere, they inherit
// currentColor, and they never render differently across devices.
const NAV_ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
  ),
  objects: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M14 9h5a1 1 0 0 1 1 1v11"/><path d="M2 21h20"/><path d="M7 8h2M7 12h2M7 16h2M17 13h1M17 17h1"/></svg>
  ),
  clients: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><circle cx="17.5" cy="9.5" r="2.5"/><path d="M16 15.2c2.6.3 4.6 1.8 5.5 4.3"/></svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8.5 9l2 2 4-4.5M8.5 16.5H15"/></svg>
  ),
  buildings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
  ),
  rentals: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><circle cx="8" cy="15" r="4"/><path d="M11 12 20 3M17 6l2 2M14 9l2 2"/></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/></svg>
  ),
  debtors: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>
  ),
  finance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a1 1 0 0 1 1 1v2"/><path d="M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 5.5"/><circle cx="16" cy="14" r="1.2"/></svg>
  ),
};

const navItems = [
  { href: "/", key: "dashboard" as const },
  // Шахматка is the screen people open most, so it sits right under the dashboard.
  { href: "/buildings", key: "buildings" as const },
  { href: "/objects", key: "objects" as const },
  { href: "/clients", key: "clients" as const },
  { href: "/debtors", key: "debtors" as const },
  { href: "/finance", key: "finance" as const },
  { href: "/tasks", key: "tasks" as const },
  { href: "/rentals", key: "rentals" as const },
  { href: "/settings", key: "settings" as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useLocale();
  const { settings, loading: settingsLoading } = useSettings();
  // Role AND e-mail come from the same shared snapshot -- the shell used to
  // fire its own auth.getUser() on top of useRole()'s, for the one string it
  // prints in the sidebar footer.
  const { role, access, loading: roleLoading, email: userEmail } = useAuth();
  // Settings (company data, staff accounts, audit log) is admin territory --
  // the pages themselves refuse non-admins, but showing the menu item just
  // leads staff to an "access denied" dead end. RLS stays the real lock.
  // What the person may open comes from their access (role default + what the
  // administrator granted): sales sections need a sales level, Finance needs a
  // finance level, Settings is admin's. On top of that the administrator can
  // hide sections for everyone (Settings -> Меню) -- hidden means "not in the
  // menu", the page itself is still reachable by its address. While the role is
  // still loading the sales menu is shown, as it always was, so the sidebar
  // does not flash empty.
  const hiddenNav = new Set(settings.hidden_nav ?? []);
  const canSales = roleLoading ? true : canView(access.sales);
  // Finance in the menu: the books (read / write) or, for someone who only buys
  // for the company, their own small screen ("own").
  const canFinance = canView(access.finance) || isOwnOnly(access.finance);
  const visibleNavItems = navItems.filter((item) => {
    if (item.key === "settings") return role === "admin";
    if (item.key === "finance") return canFinance && !hiddenNav.has("finance");
    return canSales && (item.key === "dashboard" || !hiddenNav.has(item.key));
  });
  const pathname = usePathname();
  const router = useRouter();
  // Someone who has finance but no sales works in Finance only: everything
  // else is not theirs (and the database refuses them the data anyway).
  const financeOnly = !roleLoading && role !== "none" && !canView(access.sales) && canFinance;
  const outsideFinance = financeOnly && !pathname.startsWith("/finance");
  useEffect(() => {
    if (outsideFinance) router.replace("/finance");
  }, [outsideFinance, router]);

  // The phone tab bar scrolls sideways once there are more tabs than fit; keep
  // the one you are on in view.
  const mobileNavRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mobileNavRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname, visibleNavItems.length]);
  const brandName = settings.company_name || t.appName;
  // One destination (a person who only has Finance) needs no tab bar: it would
  // be a single tab, and it would eat the bottom of a phone screen.
  const showBottomNav = visibleNavItems.length > 1;

  // Apply the hero theme app-wide: the company-wide default (admin Settings)
  // unless this user set a personal override. Re-runs when the company value
  // loads/changes so its accent-color reaches every page.
  //
  // Skipped while settings are still loading: the root layout already paints
  // <html> in the company's real theme server-side (see getBranding()), and
  // `settings` sits on DEFAULT_SETTINGS (hero_theme: null) until the fetch
  // resolves. Running this during that window would wipe the correct
  // server-applied theme back to "atlas" for a frame, then re-apply the real
  // one once the fetch lands -- exactly the indigo-then-real-color flash this
  // guard exists to prevent.
  useEffect(() => {
    if (settingsLoading) return;
    applyHeroTheme(settings.hero_theme, settings.hero_pattern);
  }, [settingsLoading, settings.hero_theme, settings.hero_pattern]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // A signed-in user with no assigned role gets NO app -- just a "waiting for
  // access" screen and a sign-out button. Server-side RLS already denies them
  // data; this stops the shell (and any readable list) from showing at all
  // until an admin grants them a role.
  // ...or has a role but every area was switched off for them.
  if (!roleLoading && (role === "none" || (!canView(access.sales) && !canFinance))) {
    return (
      <div className="hero-gradient hero-panel flex min-h-screen w-full items-center justify-center p-6 text-white">
        <div className="w-full max-w-md rounded-2xl bg-white/10 p-8 text-center backdrop-blur-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/15">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
          </div>
          <h1 className="text-xl font-semibold">{t.access.pendingTitle}</h1>
          <p className="mt-2 text-sm text-white/80">{t.access.pendingBody}</p>
          {userEmail && <p className="mt-3 text-xs text-white/60">{userEmail}</p>}
          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-light btn-md mt-6 w-full"
          >
            {t.login.logout}
          </button>
        </div>
      </div>
    );
  }

  return (
    // h-dvh (not h-screen/100vh) + overflow-hidden pins the shell to the
    // viewport: the sidebar and header never move, only <main> scrolls.
    // 100vh on a phone browser is the LARGEST the viewport ever gets, with
    // the address bar collapsed -- so a shell pinned to h-screen sat
    // taller than the visible area whenever the address bar was showing,
    // pushing the bottom nav bar partway offscreen until the user
    // scrolled it into view. 100dvh tracks the browser chrome instead.
    // Print must undo all of it -- a fixed-height scroll container clips
    // a printed document to one viewport worth of content.
    <div className="flex h-dvh w-full overflow-hidden print:block print:h-auto print:overflow-visible">
      <aside className="app-sidebar hero-gradient hero-panel relative hidden h-full w-60 shrink-0 overflow-y-auto sm:flex sm:flex-col print:hidden">
        {/* Same slow-drifting glow language as the hero, so the sidebar
            belongs to the same living surface. Dark mode drops it -- see
            .app-sidebar in globals.css -- since the sidebar there is flat
            graphite, not a gradient this would drift across. */}
        <div
          aria-hidden="true"
          className="side-glow animate-hero-glow pointer-events-none absolute -left-16 top-1/3 h-56 w-56 rounded-full bg-amber-300/15 blur-3xl"
        />
        {/* Same faint skyline as the dashboard hero, so the two read as one
            visual system instead of a bright gradient page dropped into a
            plain white shell. */}
        <svg
          viewBox="0 0 240 400"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full text-white/[0.06]"
        >
          <path
            fill="currentColor"
            d="M0,320 L40,260 L80,300 L120,220 L160,280 L200,200 L240,250 L240,400 L0,400 Z"
          />
        </svg>

        <Link
          href="/"
          className="relative flex items-center gap-2.5 px-5 py-5 transition-opacity hover:opacity-90"
        >
          {settings.company_logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.company_logo_url}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg bg-white/90 object-contain p-1"
            />
          )}
          <span className="line-clamp-2 text-base font-semibold leading-tight tracking-tight text-white">
            {brandName}
          </span>
        </Link>
        <nav className="relative flex flex-col gap-1 px-3">
          {visibleNavItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-[var(--side-active-bg)] text-[var(--side-active-ink)] shadow-sm"
                    : "text-white/75 hover:translate-x-1 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span
                  className={`shrink-0 transition-transform duration-200 ${
                    active ? "text-[var(--side-active-icon)]" : "group-hover:scale-110"
                  }`}
                >
                  {NAV_ICONS[item.key]}
                </span>
                {t.nav[item.key]}
                {active && (
                  <span className="animate-nav-dot ml-auto h-1.5 w-1.5 rounded-full bg-[var(--hero-3)]" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="relative mt-auto flex flex-col gap-2 border-t border-white/10 px-3 py-4">
          {userEmail && <span className="truncate px-3 text-xs text-white/40">{userEmail}</span>}
          <button
            onClick={handleLogout}
            className="group flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/75 transition-all hover:bg-white/10 hover:text-rose-200 active:scale-[0.97]"
          >
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
              {t.login.logout}
            </span>
          </button>
        </div>
      </aside>

      <PinLock />
      <SessionGuard />
      <div className="flex h-full min-w-0 flex-1 flex-col print:block print:h-auto">
        <InstallPrompt />
        <OfflineBanner />
        {/* pt- adds the notch/Dynamic Island's own height on top of the
            existing py-3 rather than replacing it -- max() so a phone with
            no cutout (safe-area-inset-top: 0) still gets the normal
            padding instead of collapsing to 0. The bottom nav below
            already does the equivalent for the home-indicator area; this
            was the one edge that didn't yet. */}
        <header
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-c)] bg-[var(--surface-1)] px-4 pb-3 sm:justify-end print:hidden"
        >
          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center gap-2 transition-opacity hover:opacity-80 sm:hidden"
          >
            {settings.company_logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.company_logo_url}
                alt=""
                className="h-7 w-7 shrink-0 rounded object-contain"
              />
            )}
            <span className="line-clamp-2 text-sm font-semibold leading-tight text-[var(--ink-1)]">
              {brandName}
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {canSales && <QuickSearch />}
            <div className="flex items-center gap-1 rounded-full border border-[var(--border-c)] p-1 text-sm">
              {(["ru", "tj"] as Locale[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  className={`rounded-full px-3 py-1 font-medium transition-colors ${
                    locale === l
                      ? "bg-brand text-white"
                      : "text-[var(--ink-4)] hover:bg-[var(--hover-c)]"
                  }`}
                >
                  {l === "ru" ? "RU" : "ТОҶ"}
                </button>
              ))}
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main
          className={`flex-1 overflow-y-auto overflow-x-hidden bg-[var(--surface-0)] p-4 sm:p-5 sm:pb-5 print:overflow-visible print:bg-white print:p-0 ${
            showBottomNav ? "pb-24" : "pb-6"
          }`}
        >
          {outsideFinance ? null : children}
        </main>

        {/* App-style bottom navigation on phones (the sidebar is desktop-only).
            Fixed, safe-area aware, active tab in the theme colour. */}
        {showBottomNav && (
        <nav
          ref={mobileNavRef}
          // Opaque, not translucent+blurred: a backdrop-filter across the full
          // width of a fixed bar makes the browser re-composite everything
          // behind it on every scroll frame, and at bg-white/95 there was
          // nothing visible to blur anyway.
          className="fixed inset-x-0 bottom-0 z-40 flex items-stretch overflow-x-auto border-t border-[var(--border-c)] bg-[var(--surface-1)] pb-[env(safe-area-inset-bottom)] [scrollbar-width:none] sm:hidden print:hidden [&::-webkit-scrollbar]:hidden"
        >
          {visibleNavItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-[4.6rem] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  active ? "text-brand" : "text-[var(--ink-5)]"
                }`}
              >
                <span className={active ? "scale-110 transition-transform" : ""}>
                  {NAV_ICONS[item.key]}
                </span>
                <span className="truncate">{t.nav[item.key]}</span>
              </Link>
            );
          })}
        </nav>
        )}
      </div>
    </div>
  );
}
