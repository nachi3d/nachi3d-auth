#!/usr/bin/env tsx
/**
 * Download the SIL OFL TTF files used by the card PDF generator.
 *
 *   npm run fetch:fonts
 *
 * Files land in public/fonts/ (gitignored). Run once per environment
 * that needs to render the certificate card with the real typography —
 * dev machines, CI, and the Cloudflare Pages build.
 *
 * All four families are SIL Open Font License 1.1, which explicitly
 * permits embedding into documents. URLs point at github.com/google/fonts
 * (the upstream registry the Google Fonts CDN serves from). If a URL 404s
 * upstream, replace it with the matching path from the project's release
 * tarball — never substitute a non-OFL family.
 */
import path from "node:path";
import fs from "node:fs/promises";

const FONT_DIR = path.resolve(process.cwd(), "public", "fonts");

interface FontDownload {
  filename: string;
  url: string;
  notes: string;
}

const FONTS: FontDownload[] = [
  {
    filename: "Inter-Regular.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
    notes:
      "Inter variable. Picks the regular instance at render time via pdf-lib font subsetting.",
  },
  {
    filename: "Inter-Bold.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
    notes:
      "Same TTF as Inter-Regular — variable font. We embed it twice and let pdf-lib subset for the weight we use.",
  },
  {
    filename: "CormorantGaramond-Regular.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond-Regular.ttf",
    notes: "Cormorant Garamond Regular.",
  },
  {
    filename: "CormorantGaramond-Italic.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond-Italic.ttf",
    notes: "Cormorant Garamond Italic — used for the pull-quote.",
  },
  {
    filename: "JetBrainsMono-Regular.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
    notes: "JetBrains Mono variable.",
  },
  {
    filename: "NotoSansArabic-Regular.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf",
    notes: "Noto Sans Arabic — required for the AR auth notice on the back.",
  },
];

async function downloadOne(font: FontDownload): Promise<void> {
  const dest = path.join(FONT_DIR, font.filename);
  try {
    await fs.access(dest);
    process.stdout.write(`✓ ${font.filename} (already present)\n`);
    return;
  } catch {
    /* not yet downloaded */
  }

  process.stdout.write(`↓ ${font.filename} ... `);
  const res = await fetch(font.url, { redirect: "follow" });
  if (!res.ok) {
    process.stdout.write(`FAILED (${res.status})\n`);
    throw new Error(
      `Could not fetch ${font.url}: HTTP ${res.status}. ${font.notes}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  process.stdout.write(`${(buf.byteLength / 1024).toFixed(0)} KB\n`);
}

async function main() {
  await fs.mkdir(FONT_DIR, { recursive: true });
  for (const font of FONTS) {
    await downloadOne(font);
  }
  process.stdout.write(
    `\nDone. Files in ${FONT_DIR}.\nThese are SIL OFL 1.1 — embedding permitted.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
