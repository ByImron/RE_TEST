import { Source_Serif_4 } from "next/font/google";

// The one typeface for the printed contract and receipt, and the headings on
// the login screen. Self-hosted via
// next/font, so it renders identically on every machine and never depends on
// the OS happening to have it.
//
// "cyrillic-ext" is not optional. Tajik's own letters -- ғ қ ҳ ҷ ӣ ӯ and the
// capitals -- are not in the plain "cyrillic" subset; they sit in Google's
// extended one (U+0460-052F). Loading only ["cyrillic", "latin"] leaves every
// one of those glyphs to a fallback face, and the mismatched letterforms
// inside otherwise-consistent words are what made an earlier face look
// broken on paper. Source Serif 4 ships all twelve, checked one by one.
//
// One family, not a serif/sans pair: it prints crisply in black-and-white
// (real weights, no thin hairline strokes) and keeps every glyph consistent.
export const documentFont = Source_Serif_4({
  subsets: ["cyrillic", "cyrillic-ext", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});
