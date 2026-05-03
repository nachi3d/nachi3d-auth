import "server-only";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * Custom-font loading for the card PDF. The four fonts the card design
 * needs are SIL OFL-licensed (embedding permitted): Inter, Cormorant
 * Garamond, JetBrains Mono, and Noto Sans Arabic. The TTFs ship in
 * public/fonts/ alongside the OFL.txt files. `npm run fetch:fonts` is
 * available for upgrading to a newer upstream release, but is not a
 * required setup step — fresh clones already have everything they need.
 *
 * If a TTF is missing (e.g. a developer deleted one mid-upgrade), we
 * fall back to the matching standard PDF font (Helvetica / Times-Roman
 * / Times-Italic / Courier) so the route still produces a valid PDF
 * and tests don't go red. The card looks plain in that case.
 */

export const FONT_DIR = path.resolve(process.cwd(), "public", "fonts");

export const FONT_FILES = {
  sansRegular: "Inter-Regular.ttf",
  sansBold: "Inter-Bold.ttf",
  serifRegular: "CormorantGaramond-Regular.ttf",
  serifItalic: "CormorantGaramond-Italic.ttf",
  monoRegular: "JetBrainsMono-Regular.ttf",
  arabicRegular: "NotoSansArabic-Regular.ttf",
} as const;

export type FontKey = keyof typeof FONT_FILES;

export async function readFontFile(key: FontKey): Promise<Uint8Array | null> {
  const filename = FONT_FILES[key];
  const filePath = path.join(FONT_DIR, filename);
  try {
    const bytes = await fs.readFile(filePath);
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

export async function readAllFonts(): Promise<
  Partial<Record<FontKey, Uint8Array>>
> {
  const entries = await Promise.all(
    (Object.keys(FONT_FILES) as FontKey[]).map(async (key) => {
      const bytes = await readFontFile(key);
      return [key, bytes] as const;
    }),
  );
  const result: Partial<Record<FontKey, Uint8Array>> = {};
  for (const [key, bytes] of entries) {
    if (bytes) result[key] = bytes;
  }
  return result;
}
