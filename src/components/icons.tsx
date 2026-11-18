// Small shared line icons, used wherever a button or empty state used to
// carry an emoji (🖨, 📄, 💵, 🏠, 🧾, ✎, ⚙, ✂, ⚠) instead of a real icon.
//
// All of them are stroke-only on `currentColor` at one weight, so they take
// the colour of whatever they sit in -- brand button, muted empty state,
// danger row -- and follow the company theme automatically. An emoji can't:
// it's a fixed full-colour glyph that renders differently on every OS and
// ignores the theme entirely.

type IconProps = { className?: string };

function Icon({
  className = "h-4 w-4",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function PrintIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6.5 8.5V4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v4" />
      <rect x="3.5" y="8.5" width="17" height="7.5" rx="1.5" />
      <path d="M7 13.5h10V19a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-5.5z" />
      <circle cx="16.5" cy="11.5" r="0.6" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function DocumentIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 3.5h8l4 4V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
      <path d="M14 3.5v4h4" />
      <path d="M8 13h8M8 16.5h5" />
    </Icon>
  );
}

// Banknote -- the "record a payment" action.
export function MoneyIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v5M18 9.5v5" />
    </Icon>
  );
}

// House -- "no apartments yet" empty state.
export function HomeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </Icon>
  );
}

// Torn-off receipt slip -- "no receipts yet" empty state.
export function ReceiptIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5.5 3.5h13v17l-2.2-1.5-2.15 1.5L12 19l-2.15 1.5L7.7 19 5.5 20.5z" />
      <path d="M9 8h6M9 11.5h6" />
    </Icon>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 20h4L19.5 8.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z" />
      <path d="M14.5 5.5 18.5 9.5" />
    </Icon>
  );
}

export function GearIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
    </Icon>
  );
}

// Cut line marker on the printed two-copy receipt sheet.
export function ScissorsIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8.1 7.5 20 18M8.1 16.5 20 6" />
    </Icon>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3.5 21.5 20H2.5z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function TaskIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3.5h6v2H9z" />
      <path d="M8.5 12.2 10.5 14.2 15 9.5" />
    </Icon>
  );
}

export function DuplicateIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.8" />
      <path d="M15.5 5.5H6a1.5 1.5 0 0 0-1.5 1.5v9.5" />
    </Icon>
  );
}

// Two branches becoming one -- used for "merge this into that" actions
// (duplicate finance category -> one survivor), the classic git-merge glyph.
export function MergeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="18" cy="18" r="2.5" />
      <circle cx="6" cy="6" r="2.5" />
      <path d="M6 8.5v9.5M6 8.5a8.5 8.5 0 0 0 8.5 8.5h1" />
    </Icon>
  );
}

export function TagIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3.5 11V4.5a1 1 0 0 1 1-1H11l9 9-7.5 7.5-9-9z" />
      <circle cx="7.75" cy="7.75" r="1.15" />
    </Icon>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3.5v11M8 10.5l4 4 4-4" />
      <path d="M4.5 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </Icon>
  );
}

export function TableIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M9.5 9.5v10M15 9.5v10" />
    </Icon>
  );
}

export function PdfIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 3.5h7.5L18.5 8.5V20a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" />
      <path d="M13.5 3.5v5h5" />
      <path d="M8.5 16.5v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5M13 16.5v-4h1.3a1.2 1.2 0 0 1 1.2 1.2v1.6a1.2 1.2 0 0 1-1.2 1.2H13z" />
    </Icon>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.8" />
      <path d="M3.5 10h17M8.5 3v4M15.5 3v4" />
    </Icon>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Icon>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Icon>
  );
}

export function BlueprintIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 12h6.5V4.5M10 12v7.5M14 19.5V15h6.5" />
    </Icon>
  );
}

// Sort options as icons. The four written-out choices ("Нав", "Кӯҳна",
// "А–Я", "Я–А") took more width than the date range they sat next to; the
// pair is distinguished by WHAT is sorted -- a calendar for the date a client
// was added, a letter for their name -- and the arrow gives the direction.
// Each button still names itself on hover, so the icon never has to carry the
// whole meaning on its own.
function SortArrow({ up }: { up: boolean }) {
  return up ? (
    <path d="M18 20V8m0 0-2.6 2.8M18 8l2.6 2.8" />
  ) : (
    <path d="M18 8v12m0 0 2.6-2.8M18 20l-2.6-2.8" />
  );
}

export function SortDateNewIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="2.5" y="5" width="11" height="10.5" rx="1.5" />
      <path d="M2.5 8.5h11M5.5 3.5v3M10.5 3.5v3" />
      <SortArrow up={false} />
    </Icon>
  );
}

export function SortDateOldIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="2.5" y="5" width="11" height="10.5" rx="1.5" />
      <path d="M2.5 8.5h11M5.5 3.5v3M10.5 3.5v3" />
      <SortArrow up />
    </Icon>
  );
}

// The "А" is drawn, not typed: a <text> glyph inside a stroke-only icon set
// picks up the font of whatever page it lands on and stops matching its
// neighbours.
function LetterA() {
  return <path d="M2.5 16.5 7 5l4.5 11.5M4.2 12.6h5.6" />;
}

export function SortNameAzIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <LetterA />
      <SortArrow up={false} />
    </Icon>
  );
}

export function SortNameZaIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <LetterA />
      <SortArrow up />
    </Icon>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </Icon>
  );
}

export function FilterIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 5h16l-6.2 7.4V18l-3.6 1.6v-7.2z" />
    </Icon>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 9.5l6 6 6-6" />
    </Icon>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function BuildingIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M14 9h5a1 1 0 0 1 1 1v11M2 21h20" />
      <path d="M7 8h2M7 12h2M7 16h2M17 13h1M17 17h1" />
    </Icon>
  );
}

export function PaletteIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.4-9-7.4z" />
      <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function MailIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 6.5 8 6 8-6" />
    </Icon>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3l7.5 3v5.5c0 4.5-3.1 8-7.5 9.5-4.4-1.5-7.5-5-7.5-9.5V6L12 3z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </Icon>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
      <circle cx="17.5" cy="9.5" r="2.5" />
      <path d="M16 15.2c2.6.3 4.6 1.8 5.5 4.3" />
    </Icon>
  );
}

export function ListIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 5h16M4 12h16M4 19h10" />
      <circle cx="19" cy="19" r="2" />
    </Icon>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

export function WalletIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a1 1 0 0 1 1 1v2" />
      <path d="M3 7.5V18a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 5.5" />
      <circle cx="16" cy="14" r="1.2" />
    </Icon>
  );
}

export function ArrowUpRightIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M7 17 17 7M8 7h9v9" />
    </Icon>
  );
}

export function ArrowDownLeftIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M17 7 7 17M16 17H7V8" />
    </Icon>
  );
}

// The WhatsApp speech bubble. One glyph for every WhatsApp button in the app.
export function WhatsAppIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a13 13 0 0 1-1.5-.5c-2.6-1.1-4.3-3.7-4.4-3.9-.1-.2-1-1.4-1-2.6s.6-1.8.9-2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c0 .2.1.3 0 .5l-.3.5-.4.5c-.2.1-.3.3-.1.6.1.3.7 1.1 1.4 1.8.9.9 1.7 1.1 2 1.3.2.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l2 .9c.2.1.4.2.4.3.1.1.1.6-.1 1.1Z" />
    </svg>
  );
}
