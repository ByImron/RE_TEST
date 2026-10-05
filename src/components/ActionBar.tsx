"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CloseIcon, FilterIcon, SearchIcon, TrashIcon } from "@/components/icons";

// ---------------------------------------------------------------------------
// One toolbar language for the whole app.
//
//  * Everything is compact and the SAME size: a control is a 32px square (28px
//    in dense spots) sitting in a 38px (34px) bordered box. No page gets to
//    pick its own heights any more.
//  * Rest state is quiet -- an outline glyph, no fill. Hover lights it up in
//    the site's yellow (--accent-yellow, dark ink on it). A toggled-on control
//    is the opposite: solid dark with a yellow glyph (yellow with a dark glyph
//    in the dark theme). So hover = "you can press this", dark = "this is on".
//  * A control that has more to say (search, filter) is an icon that unfolds:
//    it expands on hover/focus and stays open while it holds something.
//  * The one "make a new thing" action per page is the only control that is
//    yellow at rest (tone="primary").
// ---------------------------------------------------------------------------

// One row, everything on the right.
//
// Action rows were previously built ad hoc with `justify-between`: the icon
// segment pinned left, the text buttons pinned right, and a stretch of empty
// space in between. On a wide screen the two halves ended up far enough apart
// to read as unrelated controls, and the eye had to cross the whole card to
// find them. Collecting them into a single right-aligned cluster gives every
// screen the same place to look.
//
// Wraps to the right on narrow screens rather than stacking to the left, so
// the grouping survives on a phone.
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}

// Toolbars sit in two kinds of place: page headers, where they are the main
// controls, and dense spots (cards, table rows) where even that is too big.
// The toolbar declares the size once and every control in it follows, so a
// row can't come out with mismatched buttons.
export type ToolbarSize = "sm" | "md";

const SizeContext = createContext<ToolbarSize>("md");

// Single-key shortcuts ("N" = new, "/" = search) must never fire while someone
// is typing, while a modal or the quick-search overlay is open, or with a
// modifier held (Ctrl+N belongs to the browser). Matched on `event.code`, not
// `event.key`: on the Russian layout the N key types "т", and a shortcut that
// only works on the English layout is no shortcut for these users.
export function useHotkey(code: string, onPress: () => void, enabled = true) {
  const handler = useRef(onPress);
  useEffect(() => {
    handler.current = onPress;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== code || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) {
        return;
      }
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector("div.fixed.inset-0")) return;
      e.preventDefault();
      handler.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, enabled]);
}

const SIZE_CLASSES: Record<ToolbarSize, { button: string; icon: string; box: string }> = {
  sm: { button: "h-7 w-7", icon: "[&_svg]:h-[15px] [&_svg]:w-[15px]", box: "h-[34px]" },
  md: { button: "h-8 w-8", icon: "[&_svg]:h-[17px] [&_svg]:w-[17px]", box: "h-[38px]" },
};

// Shared looks. "on" is the toggled state; hover is the yellow highlight.
const HOVER_YELLOW =
  "hover:bg-[var(--accent-yellow)] hover:text-[#18181b] focus-visible:bg-[var(--accent-yellow)] focus-visible:text-[#18181b]";
const ON_LOOK =
  "bg-[#18181b] text-[var(--accent-yellow)] dark:bg-[var(--accent-yellow)] dark:text-[#18181b]";
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#18181b] dark:focus-visible:outline-[var(--accent-yellow)]";

// The bordered container that glues neighbouring controls into ONE control.
// Anything that sits shoulder to shoulder belongs in here -- icon buttons,
// text pills, a select -- so a row never reads as a scattering of separate
// widgets.
//
// Deliberately NOT `overflow-hidden`: the tooltips below each icon have to be
// able to escape it. Rounding lives on the individual children instead.
//
// `scrollable` opts a group into `overflow-x-auto` instead of `w-fit` -- for
// rows that can genuinely outgrow a phone's width and would otherwise just get
// cut off. Off by default: setting overflow-x forces overflow-y to `auto` too
// (a real CSS rule), which WOULD clip an IconAction tooltip poking out below
// it -- so it is only for groups built from PillButton/plain content, never one
// holding an IconAction.
//
// min-w-0 alongside max-w-full/overflow-x-auto is not decorative: ControlGroup
// is always a flex item, and a flex item's default min-width is `auto` ("never
// shrink below your content"), which would keep the group as wide as its pills
// need and let <main>'s overflow-x-hidden silently clip it.
//
// `wrap` is the version for groups that DO hold an IconAction: plain
// `flex-wrap`, no overflow property touched.
export function ControlGroup({
  children,
  size = "md",
  scrollable = false,
  wrap = false,
  className = "",
}: {
  children: ReactNode;
  size?: ToolbarSize;
  scrollable?: boolean;
  wrap?: boolean;
  className?: string;
}) {
  return (
    <SizeContext.Provider value={size}>
      <div
        className={`inline-flex items-center gap-0.5 rounded-lg border border-[var(--border-strong-c)] bg-[var(--surface-1)] p-0.5 ${
          scrollable
            ? "min-w-0 max-w-full overflow-x-auto"
            : wrap
              ? "min-w-0 max-w-full flex-wrap"
              : "w-fit"
        } ${size === "sm" ? "min-h-[34px]" : "min-h-[38px]"} ${className}`}
      >
        {children}
      </div>
    </SizeContext.Provider>
  );
}

// Kept as the name most call sites already use; a toolbar is just a control
// group that happens to hold only icons.
export const IconToolbar = ControlGroup;

// A hairline between two clusters inside one group.
export function GroupDivider() {
  const size = useContext(SizeContext);
  return (
    <span
      aria-hidden="true"
      className={`mx-0.5 w-px shrink-0 bg-[var(--border-c)] ${size === "sm" ? "h-4" : "h-5"}`}
    />
  );
}

// A text option inside a group (sort order, status filter, period). Same
// height as the icon buttons beside it, so a mixed group sits on one line.
export function PillButton({
  label,
  active = false,
  onClick,
  size,
  title,
}: {
  label: ReactNode;
  active?: boolean;
  onClick: () => void;
  size?: ToolbarSize;
  title?: string;
}) {
  const inherited = useContext(SizeContext);
  const s = size ?? inherited;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-md font-medium transition-colors duration-150 active:scale-[0.97] ${FOCUS_RING} ${
        s === "sm" ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-[13px]"
      } ${active ? ON_LOOK : `text-[var(--ink-3)] ${HOVER_YELLOW}`}`}
    >
      {label}
    </button>
  );
}

// One icon-only action with its name on hover.
//
// The label is not decoration: an icon on its own is a guess until you click
// it. It is exposed three ways -- a styled tooltip for the mouse, `title` for
// the browser's own tooltip and touch long-press, and `aria-label` for screen
// readers.
export function IconAction({
  label,
  icon,
  onClick,
  href,
  active = false,
  tone = "quiet",
  disabled = false,
  size,
  shortcut,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  /** Toggled-on look, for actions that hold a state (e.g. edit mode). */
  active?: boolean;
  /** "primary" is the one yellow-at-rest control: the page's "add" action. */
  tone?: "quiet" | "primary" | "danger";
  disabled?: boolean;
  /** Overrides the size inherited from the surrounding toolbar. */
  size?: ToolbarSize;
  /** A single letter that triggers this action from anywhere ("N" for new). */
  shortcut?: string;
}) {
  const inherited = useContext(SizeContext);
  const s = SIZE_CLASSES[size ?? inherited];
  const ref = useRef<HTMLAnchorElement & HTMLButtonElement>(null);
  useHotkey(`Key${shortcut?.toUpperCase()}`, () => ref.current?.click(), !!shortcut && !disabled);
  // The `[&_svg]` rule sizes the icon from here rather than trusting each call
  // site to pass the same h-4 w-4 -- one place to change.
  const base =
    `flex ${s.button} ${s.icon} shrink-0 items-center justify-center rounded-md transition-colors duration-150 ` +
    `active:scale-95 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`;
  const look = active
    ? ON_LOOK
    : tone === "primary"
      ? "bg-[var(--accent-yellow)] text-[#18181b] hover:brightness-95"
      : tone === "danger"
        ? "text-[var(--wash-rose-ink)] hover:bg-[var(--wash-rose)]"
        : `text-[var(--ink-3)] ${HOVER_YELLOW}`;

  const inner = <span className="pointer-events-none">{icon}</span>;

  return (
    <span className="group/tip relative inline-flex">
      {href ? (
        <Link ref={ref} href={href} title={label} aria-label={label} className={`${base} ${look}`}>
          {inner}
        </Link>
      ) : (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          disabled={disabled}
          title={label}
          aria-label={label}
          className={`${base} ${look}`}
        >
          {inner}
        </button>
      )}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-30 mt-2 whitespace-nowrap rounded-md bg-[#18181b] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {label}
        {shortcut && (
          <kbd className="ml-1.5 rounded bg-white/20 px-1 font-sans text-[10px] font-semibold text-[var(--accent-yellow)]">
            {shortcut.toUpperCase()}
          </kbd>
        )}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Search that unfolds.
//
// At rest it is a single magnifier in the same 38px box as every other
// control. Hover or focus (a tap, on a phone) and it grows into a text field;
// it stays open for as long as it holds text or has focus, and folds back
// otherwise. "/" jumps to it from anywhere that isn't already a text field.
// ---------------------------------------------------------------------------
export function ExpandSearch({
  value,
  onChange,
  placeholder,
  size = "md",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  size?: ToolbarSize;
}) {
  const s = SIZE_CLASSES[size];
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const open = focused || value.length > 0;

  useHotkey("Slash", () => inputRef.current?.focus());

  return (
    <div
      className={`group/search inline-flex ${s.box} min-w-0 max-w-full items-center overflow-hidden rounded-lg border bg-[var(--surface-1)] p-0.5 transition-[width,border-color] duration-200 ease-out ${
        open
          ? "w-64 border-[#18181b] dark:border-[var(--accent-yellow)]"
          : "w-[38px] border-[var(--border-strong-c)] lg:hover:w-64"
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={placeholder}
        title={`${placeholder}  ( / )`}
        onClick={() => inputRef.current?.focus()}
        className={`flex ${s.button} ${s.icon} shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
          open
            ? "text-[#18181b] dark:text-[var(--accent-yellow)]"
            : `text-[var(--ink-3)] group-hover/search:bg-[var(--accent-yellow)] group-hover/search:text-[#18181b]`
        }`}
      >
        <SearchIcon />
      </button>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 min-w-0 flex-1 bg-transparent px-1.5 text-sm text-[var(--ink-1)] placeholder:text-[var(--ink-5)] focus:border-transparent! focus:shadow-none! focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="×"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className={`flex ${s.button} shrink-0 items-center justify-center rounded-md text-[var(--ink-4)] transition-colors ${HOVER_YELLOW}`}
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filters that unfold.
//
// One funnel button for everything that narrows or orders a list. At rest it
// is an icon; hover shows its name; once something is applied it stays open as
// a dark chip that says how many things are on (and can be clicked to change
// them). Clicking opens a panel with the actual controls (a bottom sheet on a
// phone, where a dropdown anchored to the button would run off the screen). The
// panel closes on an outside click or Escape.
// ---------------------------------------------------------------------------
export function FilterMenu({
  label,
  activeCount = 0,
  summary,
  onReset,
  resetLabel,
  size = "md",
  children,
}: {
  label: string;
  /** How many filters are currently narrowing the list. */
  activeCount?: number;
  /** Optional short text for the closed state ("В работе") instead of the label. */
  summary?: string | null;
  onReset?: () => void;
  resetLabel?: string;
  size?: ToolbarSize;
  children: ReactNode;
}) {
  const s = SIZE_CLASSES[size];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A `summary` ("Этот месяц") keeps the button open even with nothing
  // narrowed: it says what the list is showing, not only that a filter is on.
  const on = activeCount > 0 || !!summary;
  const shown = summary || label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={`group/filter inline-flex ${s.box} items-center rounded-lg border bg-[var(--surface-1)] p-0.5 transition-colors duration-150 ${FOCUS_RING} ${
          on || open
            ? "border-[#18181b] dark:border-[var(--accent-yellow)]"
            : "border-[var(--border-strong-c)]"
        }`}
      >
        <span
          className={`flex ${s.button} ${s.icon} shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
            on || open
              ? ON_LOOK
              : "text-[var(--ink-3)] group-hover/filter:bg-[var(--accent-yellow)] group-hover/filter:text-[#18181b]"
          }`}
        >
          <FilterIcon />
        </span>
        <span
          className={`overflow-hidden whitespace-nowrap text-[13px] font-medium text-[var(--ink-2)] transition-[max-width,opacity,padding] duration-200 ease-out ${
            on
              ? "max-w-[12rem] pl-1.5 pr-2 opacity-100"
              : "max-w-0 pl-0 pr-0 opacity-0 group-hover/filter:max-w-[12rem] group-hover/filter:pl-1.5 group-hover/filter:pr-2 group-hover/filter:opacity-100"
          }`}
        >
          {shown}
          {activeCount > 0 && (
            <span className="ml-1.5 rounded-full bg-[#18181b] px-1.5 py-px text-[11px] font-bold text-[var(--accent-yellow)] dark:bg-[var(--accent-yellow)] dark:text-[#18181b]">
              {activeCount}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="animate-modal-panel absolute right-0 top-full z-30 mt-2 flex w-[22rem] flex-col gap-3.5 rounded-xl border border-[var(--border-strong-c)] bg-[var(--surface-1)] p-3.5 shadow-xl max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:z-50 max-sm:mt-0 max-sm:w-auto"
        >
          {children}
          {activeCount > 0 && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="self-start rounded-md px-1.5 py-1 text-xs font-semibold text-[var(--ink-3)] underline underline-offset-4 transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
            >
              {resetLabel ?? "×"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// A labelled block inside a FilterMenu panel.
export function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
        {label}
      </p>
      {children}
    </div>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

// One option in a FilterMenu: a toggle chip. Same on/hover language as the
// toolbar controls.
export function Chip({
  label,
  icon,
  active = false,
  onClick,
}: {
  label: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors duration-150 active:scale-[0.97] ${FOCUS_RING} ${
        active
          ? `${ON_LOOK} border-transparent`
          : `border-[var(--border-c)] text-[var(--ink-2)] ${HOVER_YELLOW} hover:border-transparent`
      } [&_svg]:h-[15px] [&_svg]:w-[15px]`}
    >
      {icon}
      {label}
    </button>
  );
}

// A native <select> dressed to match the chips, for lists too long to be chips
// (a building picker).
export const FILTER_SELECT =
  "h-9 w-full rounded-lg border border-[var(--border-c)] bg-[var(--field-bg)] px-2.5 text-sm text-[var(--ink-1)] transition-colors hover:border-[var(--accent-yellow)] focus:border-[#18181b] focus:outline-none focus:ring-2 focus:ring-[var(--accent-yellow)] dark:focus:border-[var(--accent-yellow)]";
export const FILTER_DATE =
  "h-9 min-w-0 flex-1 rounded-lg border border-[var(--border-c)] bg-[var(--field-bg)] px-2 text-sm text-[var(--ink-1)] transition-colors hover:border-[var(--accent-yellow)] focus:border-[#18181b] focus:outline-none focus:ring-2 focus:ring-[var(--accent-yellow)] dark:focus:border-[var(--accent-yellow)]";

// ---------------------------------------------------------------------------
// What is narrowing this list, at a glance.
//
// The filter funnel says HOW MANY things are on; this says WHICH, as one
// removable chip each -- so a list that looks short for no visible reason
// explains itself, and any single filter comes off with one click instead of
// re-opening the panel.
// ---------------------------------------------------------------------------
export type ActiveFilter = { key: string; label: string; onRemove: () => void };

function ActiveFilters({
  items,
  onClearAll,
  clearLabel,
}: {
  items: ActiveFilter[];
  onClearAll?: () => void;
  clearLabel?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {items.map((f) => (
        <span
          key={f.key}
          className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full border border-[color-mix(in_srgb,var(--accent-yellow)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent-yellow)_24%,var(--surface-1))] pl-2.5 pr-1 text-xs font-medium text-[var(--ink-1)]"
        >
          <span className="truncate">{f.label}</span>
          <button
            type="button"
            onClick={f.onRemove}
            aria-label={`× ${f.label}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#18181b] hover:text-[var(--accent-yellow)]"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        </span>
      ))}
      {items.length > 1 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="rounded-md px-1.5 py-1 text-xs font-semibold text-[var(--ink-3)] underline underline-offset-4 transition-colors hover:bg-[var(--accent-yellow)] hover:text-[#18181b]"
        >
          {clearLabel ?? "×"}
        </button>
      )}
    </div>
  );
}

// The toolbar row every list page opens with: controls on the right, applied
// filters underneath. It sticks to the top of the scrolling <main> so search,
// filter and "new" stay in reach on a long list.
//
// The background is deliberately opaque (no backdrop blur): backdrop-filter
// makes an element the containing block of its fixed-position descendants,
// which would pin the phone filter sheet to this strip instead of the screen.
// The negative side margins cancel <main>'s padding so the strip spans edge to edge
// and content scrolling underneath is fully covered.
export function ListToolbar({
  children,
  filters = [],
  onClearAll,
  clearLabel,
}: {
  children: ReactNode;
  filters?: ActiveFilter[];
  onClearAll?: () => void;
  clearLabel?: string;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2 bg-[var(--surface-0)] px-4 py-2 sm:-mx-5 sm:px-5">
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
      <ActiveFilters items={filters} onClearAll={onClearAll} clearLabel={clearLabel} />
    </div>
  );
}

// The delete button for a row in a list or table: the same small trash icon
// everywhere, rose on hover, named by its tooltip.
export function TrashAction({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <IconAction
      label={label}
      icon={<TrashIcon />}
      tone="danger"
      size="sm"
      onClick={onClick}
      disabled={disabled}
    />
  );
}
