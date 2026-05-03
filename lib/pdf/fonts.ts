import "server-only";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * Custom-font loading for the card PDF. The four fonts the card design
 * needs are SIL OFL-licensed (embedding permitted): Inter, Cormorant
 * Garamond, JetBrains Mono, and Noto Sans Arabic. They are not committed
 * to the repo (binary, ~2 MB each) — run `npm run fetch:fonts` once on
 * any environment that should render the card with the real typography.
 *
 * If a TTF is missing, we fall back to the matching standard PDF font
 * (Helvetica / Times-Roman / Times-Italic / Courier) so build, tests,
 * and dev environments still produce a valid PDF. The card looks plain
 * in that case but every other guarantee (magic bytes, QR, layout)
 * still holds.
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
