// oxlint-disable-next-line no-unassigned-import -- the font CSS registers Geist for canvas text
import "@fontsource-variable/geist";
import type { LayerTextStyle } from "../../comp/index";
import type { Measure } from "./layout";
import type { TextShapeKey } from "./messages";
import { normalizeRuns } from "./runs";

export const GEIST_FAMILY = '"Geist Variable"';

/** PostScript names written to the file, mapped to the variable font's wght axis. */
export const GEIST_WEIGHTS: readonly { name: string; weight: number; key: TextShapeKey }[] = [
  { name: "Geist-Thin", weight: 100, key: "image.text.weight.thin" },
  { name: "Geist-ExtraLight", weight: 200, key: "image.text.weight.extraLight" },
  { name: "Geist-Light", weight: 300, key: "image.text.weight.light" },
  { name: "Geist-Regular", weight: 400, key: "image.text.weight.regular" },
  { name: "Geist-Medium", weight: 500, key: "image.text.weight.medium" },
  { name: "Geist-SemiBold", weight: 600, key: "image.text.weight.semiBold" },
  { name: "Geist-Bold", weight: 700, key: "image.text.weight.bold" },
  { name: "Geist-ExtraBold", weight: 800, key: "image.text.weight.extraBold" },
  { name: "Geist-Black", weight: 900, key: "image.text.weight.black" },
];

const FALLBACK_FONT = "Geist-Regular";

export function weightOf(fontName: string): number | null {
  return GEIST_WEIGHTS.find((w) => w.name === fontName)?.weight ?? null;
}

/** Font names in `fontName` and `fontRuns` that are not Geist, without duplicates, in order. */
export function missingFonts(s: LayerTextStyle): string[] {
  const names = [s.fontName, ...(s.fontRuns ?? []).map((r) => r.fontName)];
  return [...new Set(names.filter((n) => weightOf(n) === null))];
}

/** Switches every missing font name to Geist-Regular. */
export function replaceMissingFonts(s: LayerTextStyle): LayerTextStyle {
  const fix = (n: string) => (weightOf(n) === null ? FALLBACK_FONT : n);
  const next: LayerTextStyle = { ...s, fontName: fix(s.fontName) };
  if (!s.fontRuns) return next;
  const runs = normalizeRuns(
    s.fontRuns.map((r) => ({ ...r, fontName: fix(r.fontName) })),
    s.content.length,
    (a, b) => a.fontName === b.fontName,
  );
  if (runs.length > 0) next.fontRuns = runs;
  else delete next.fontRuns;
  return next;
}

export function cssFont(fontName: string, fontSize: number): string {
  return `${weightOf(fontName) ?? 400} ${fontSize}px ${GEIST_FAMILY}`;
}

/** Whether canvas text takes letterSpacing; without it tracking is drawn as 0. */
export function supportsTracking(): boolean {
  return (
    typeof OffscreenCanvasRenderingContext2D !== "undefined" &&
    "letterSpacing" in OffscreenCanvasRenderingContext2D.prototype
  );
}

/** Loads the Geist font file so canvas text draws with it. */
export async function ensureGeist(): Promise<void> {
  await Promise.all([
    document.fonts.load(`400 16px ${GEIST_FAMILY}`),
    document.fonts.load(`700 16px ${GEIST_FAMILY}`),
  ]);
}

/** Sets the font, and letterSpacing when supported, on `ctx`. */
export function setTextStyle(
  ctx: OffscreenCanvasRenderingContext2D,
  fontName: string,
  fontSize: number,
  tracking: number,
): void {
  ctx.font = cssFont(fontName, fontSize);
  if (supportsTracking()) ctx.letterSpacing = `${tracking}px`;
}

export function canvasMeasure(ctx: OffscreenCanvasRenderingContext2D): Measure {
  return (text, fontName, fontSize, tracking) => {
    setTextStyle(ctx, fontName, fontSize, tracking);
    return ctx.measureText(text).width;
  };
}
