#!/usr/bin/env tsx
/**
 * Download/refresh the SIL OFL TTF files used by the card PDF generator,
 * then hand them to scripts/prepare-fonts.py to instance the variable
 * axes and pre-subset to just the glyph ranges the card draws.
 *
 *   npm run fetch:fonts        # download + prepare
 *
 * Files land in public/fonts/ — they are committed to the repo, so
 * fresh clones and CI builds do NOT need to run this script. Use it
 * only to bump versions after an upstream release (delete a TTF first
 * to force re-download).
 *
 * All four families are SIL Open Font License 1.1, which explicitly
 * permits embedding into documents. URLs point at github.com/google/fonts
 * (the upstream registry the Google Fonts CDN serves from). If a URL 404s
 * upstream, replace it with the matching path from the project's release
 * tarball — never substitute a non-OFL family.
 *
 * The prepare step requires Python 3 with fontTools installed
 * (`pip install fonttools`). It is non-optional: pdf-lib 1.17.1's
 * subsetter mis-renders fonts that ship GSUB/GPOS layout tables or
 * variable-axis data, so the TTFs we commit must be pre-trimmed by
 * prepare-fonts.py before they are usable by the card route.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

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
    url: "https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf",
    notes:
      "Cormorant Garamond — variable font (wght axis). Same TTF used as the regular instance.",
  },
  {
    filename: "CormorantGaramond-Italic.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond-Italic%5Bwght%5D.ttf",
    notes: "Cormorant Garamond Italic variable — used for the pull-quote.",
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

interface LicenseDownload {
  filename: string;
  url: string;
}

const LICENSES: LicenseDownload[] = [
  {
    filename: "OFL-Inter.txt",
    url: "https://github.com/google/fonts/raw/main/ofl/inter/OFL.txt",
  },
  {
    filename: "OFL-CormorantGaramond.txt",
    url: "https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/OFL.txt",
  },
  {
    filename: "OFL-JetBrainsMono.txt",
    url: "https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/OFL.txt",
  },
  {
    filename: "OFL-NotoSansArabic.txt",
    url: "https://github.com/google/fonts/raw/main/ofl/notosansarabic/OFL.txt",
  },
];

async function downloadLicense(license: LicenseDownload): Promise<void> {
  const dest = path.join(FONT_DIR, license.filename);
  try {
    await fs.access(dest);
    return;
  } catch {
    /* not yet downloaded */
  }
  process.stdout.write(`↓ ${license.filename} ... `);
  const res = await fetch(license.url, { redirect: "follow" });
  if (!res.ok) {
    process.stdout.write(`FAILED (${res.status})\n`);
    throw new Error(`Could not fetch ${license.url}: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  process.stdout.write(`${(buf.byteLength / 1024).toFixed(1)} KB\n`);
}

async function runPreparePy(): Promise<void> {
  process.stdout.write(`\n→ prepare-fonts.py (instance axes + pre-subset)\n`);
  const script = path.join(__dirname, "prepare-fonts.py");
  const bin = process.platform === "win32" ? "python" : "python3";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, [script], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prepare-fonts.py exited with code ${code}`));
    });
  });
}

async function main() {
  await fs.mkdir(FONT_DIR, { recursive: true });
  for (const font of FONTS) {
    await downloadOne(font);
  }
  for (const license of LICENSES) {
    await downloadLicense(license);
  }
  await runPreparePy();
  process.stdout.write(
    `\nDone. Files in ${FONT_DIR}.\nAll fonts SIL OFL 1.1 — embedding permitted; license texts beside the TTFs.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
