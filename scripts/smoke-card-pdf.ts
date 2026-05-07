#!/usr/bin/env tsx
/**
 * Generate a sample card PDF to scripts/.tmp/sample-card.pdf for visual
 * inspection. The output directory is gitignored. Useful when changing
 * the card layout or upgrading fonts — open the resulting PDF in any
 * viewer to spot-check Latin / Arabic / serif italic / mono typography.
 *
 * Run with:  npx tsx scripts/smoke-card-pdf.ts
 */
import path from "node:path";
import fs from "node:fs/promises";
import { Module } from "node:module";

// Shim 'server-only' (Next.js virtual module) so the card-generator
// imports resolve under tsx.
const origResolve = (Module as unknown as {
  _resolveFilename: (req: string, parent: unknown, ...rest: unknown[]) => string;
})._resolveFilename;
(Module as unknown as {
  _resolveFilename: (req: string, parent: unknown, ...rest: unknown[]) => string;
})._resolveFilename = function (req, parent, ...rest) {
  if (req === "server-only") {
    return path.join(
      process.cwd(),
      "node_modules",
      "next",
      "dist",
      "compiled",
      "server-only",
      "empty.js",
    );
  }
  return origResolve.call(this, req, parent, ...rest);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateCardPdf } = require("../lib/pdf/card-generator") as typeof import("../lib/pdf/card-generator");

process.env.HMAC_SECRET = process.env.HMAC_SECRET ?? "smoke-secret-1234";

const piece = {
  id: "00000000-0000-0000-0000-000000000001",
  piece_number: 1,
  edition_number: 3,
  edition_total: 10,
  nfc_uid: "04A1B2C3D4E580",
  character_name: "Test Subject",
  character_quote: "Authenticity is what you carry, not what you claim.",
  sculpt_date: "2026-04-01",
  paint_date: "2026-04-15",
};

const notices = {
  en: "This card certifies the authenticity of a Nachi3D figurine. Tap the embedded NFC chip with any smartphone, or scan the QR code on the front, to view the verification page on verify.nachi3d.com.",
  fr: "Cette carte certifie l'authenticité d'une figurine Nachi3D. Approchez la puce NFC intégrée d'un smartphone, ou scannez le QR code au recto, pour consulter la page de vérification sur verify.nachi3d.com.",
  ar: "تشهد هذه البطاقة على أصالة قطعة Nachi3D. قرّب شريحة NFC المدمجة من أي هاتف ذكي، أو امسح رمز QR الموجود في الواجهة، لعرض صفحة التحقق على verify.nachi3d.com.",
  supportEmail: "Questions? hello@nachi3d.com",
};

async function main() {
  const bytes = await generateCardPdf({
    piece,
    siteUrl: "https://verify.nachi3d.com",
    notices,
  });

  const out = path.resolve(process.cwd(), "scripts", ".tmp");
  await fs.mkdir(out, { recursive: true });
  const file = path.join(out, "sample-card.pdf");
  await fs.writeFile(file, bytes);
  console.log(`Wrote ${file} (${bytes.byteLength} bytes)`);
  console.log(`Magic: ${Buffer.from(bytes.slice(0, 5)).toString("ascii")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
