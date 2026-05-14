import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { signToken } from "@/lib/hmac";
import { readAllFonts } from "./fonts";
import { shapeArabic, toRtlVisualOrder } from "./arabic-shaper";
import type { PieceRow } from "@/lib/supabase/types";

// All measurements in points; pdf-lib's native unit. 1 mm = 2.83464645 pt.
const MM = 2.83464645;
const A6_WIDTH_MM = 105;
const A6_HEIGHT_MM = 148;
const BLEED_MM = 3;

const PAGE_WIDTH = (A6_WIDTH_MM + 2 * BLEED_MM) * MM; // 111 mm
const PAGE_HEIGHT = (A6_HEIGHT_MM + 2 * BLEED_MM) * MM; // 154 mm
const SAFE_MARGIN = (BLEED_MM + 8) * MM; // 11 mm from page edge

// Card stays tonally distinct from the digital page: the physical product
// retains a matte-black ground, with the primary violet (#6C63FF) standing
// in for the previous brass/gold accent. Keep PRIMARY in 0..1 sRGB so it
// matches the on-screen --color-primary-500 token byte-for-byte.
const INK_DARK = rgb(0.04, 0.04, 0.035);
const INK_LIGHT = rgb(0.95, 0.95, 0.93);
const INK_MUTED = rgb(0.6, 0.6, 0.57);
const PRIMARY = rgb(0x6c / 255, 0x63 / 255, 0xff / 255);
const RED_ALERT = rgb(0.84, 0.32, 0.32);
void RED_ALERT;

const QR_SIZE = 25 * MM;

interface CardFonts {
  sansRegular: PDFFont;
  sansBold: PDFFont;
  serifRegular: PDFFont;
  serifItalic: PDFFont;
  monoRegular: PDFFont;
  arabicRegular: PDFFont;
}

interface AuthNotices {
  en: string;
  fr: string;
  ar: string;
  supportEmail: string;
}

export interface GenerateCardOptions {
  piece: Pick<
    PieceRow,
    | "id"
    | "piece_number"
    | "edition_number"
    | "edition_total"
    | "nfc_uid"
    | "character_name"
    | "character_quote"
    | "sculpt_date"
    | "paint_date"
    | "height_mm"
    | "base_width_mm"
    | "weight_g"
    | "material"
    | "scale"
    | "variant_label"
  >;
  siteUrl: string;
  notices: AuthNotices;
}

export async function generateCardPdf(
  opts: GenerateCardOptions,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const fonts = await loadFonts(pdf);

  await drawFront(pdf, fonts, opts);
  drawBack(pdf, fonts, opts);

  pdf.setTitle(`Nachi3D Certify — Piece #${pad4(opts.piece.piece_number)}`);
  pdf.setAuthor("Nachi3D");
  pdf.setSubject("Certificate of authenticity");
  pdf.setProducer("Nachi3D Certify");
  pdf.setCreator("Nachi3D Certify");

  return pdf.save();
}

function pad4(n: number): string {
  return n.toString().padStart(4, "0");
}

async function loadFonts(pdf: PDFDocument): Promise<CardFonts> {
  const ttfs = await readAllFonts();

  const embed = async (
    key: keyof typeof ttfs,
    fallback: StandardFonts,
  ): Promise<PDFFont> => {
    const bytes = ttfs[key];
    if (bytes) {
      try {
        // subset:false on purpose — see lib/pdf/fonts.ts header for the
        // full story. Short version: pdf-lib 1.17.1's subsetter mangles
        // glyph IDs, the TTFs in public/fonts/ are pre-trimmed by
        // scripts/prepare-fonts.py instead.
        return await pdf.embedFont(bytes, { subset: false });
      } catch {
        // fall through to standard font on any embed failure
      }
    }
    return pdf.embedFont(fallback);
  };

  return {
    sansRegular: await embed("sansRegular", StandardFonts.Helvetica),
    sansBold: await embed("sansBold", StandardFonts.HelveticaBold),
    serifRegular: await embed("serifRegular", StandardFonts.TimesRoman),
    serifItalic: await embed("serifItalic", StandardFonts.TimesRomanItalic),
    monoRegular: await embed("monoRegular", StandardFonts.Courier),
    arabicRegular: await embed("arabicRegular", StandardFonts.Helvetica),
  };
}

function pieceNumberLabel(piece: GenerateCardOptions["piece"]): string {
  if (piece.edition_number !== null && piece.edition_total !== null) {
    return `#${piece.edition_number}/${piece.edition_total}`;
  }
  return `#${pad4(piece.piece_number)}`;
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  y: number,
  color = INK_LIGHT,
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_WIDTH - width) / 2,
    y,
    size,
    font,
    color,
  });
}

function clipToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + "…";
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + "…";
}

function wrapToLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function drawFront(
  pdf: PDFDocument,
  fonts: CardFonts,
  opts: GenerateCardOptions,
): Promise<void> {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: INK_DARK,
  });

  // Logo wordmark, top-left
  page.drawText("Nachi3D", {
    x: SAFE_MARGIN,
    y: PAGE_HEIGHT - SAFE_MARGIN - 10,
    size: 11,
    font: fonts.sansBold,
    color: INK_LIGHT,
  });
  page.drawText("CERTIFY", {
    x: SAFE_MARGIN,
    y: PAGE_HEIGHT - SAFE_MARGIN - 22,
    size: 6.5,
    font: fonts.sansRegular,
    color: PRIMARY,
  });

  // Piece number — large mono, centred
  const numberLabel = pieceNumberLabel(opts.piece);
  drawCenteredText(
    page,
    numberLabel,
    fonts.monoRegular,
    44,
    PAGE_HEIGHT * 0.62,
    INK_LIGHT,
  );

  // Character name — serif, centred under number
  const characterName = clipToWidth(
    opts.piece.character_name,
    fonts.serifRegular,
    18,
    PAGE_WIDTH - 2 * SAFE_MARGIN,
  );
  drawCenteredText(
    page,
    characterName,
    fonts.serifRegular,
    18,
    PAGE_HEIGHT * 0.55,
    INK_LIGHT,
  );

  // Pull-quote (italic), centred + wrapped
  if (opts.piece.character_quote) {
    const quote = `“${opts.piece.character_quote}”`;
    const lines = wrapToLines(
      quote,
      fonts.serifItalic,
      11,
      PAGE_WIDTH - 2 * SAFE_MARGIN - 12 * MM,
    );
    let qy = PAGE_HEIGHT * 0.46;
    for (const line of lines) {
      drawCenteredText(page, line, fonts.serifItalic, 11, qy, INK_MUTED);
      qy -= 14;
    }
  }

  // Hand-sign line — bottom centre, above wordmark band
  const signY = SAFE_MARGIN + 18 * MM;
  page.drawLine({
    start: { x: PAGE_WIDTH * 0.25, y: signY },
    end: { x: PAGE_WIDTH * 0.75, y: signY },
    thickness: 0.5,
    color: INK_MUTED,
  });
  drawCenteredText(
    page,
    "signed",
    fonts.sansRegular,
    6.5,
    signY - 10,
    INK_MUTED,
  );

  // Wordmark, bottom-left
  page.drawText("Nachi3D Certify", {
    x: SAFE_MARGIN,
    y: SAFE_MARGIN,
    size: 8,
    font: fonts.sansRegular,
    color: INK_MUTED,
  });

  // QR code, bottom-right, encodes verification URL with a freshly-signed token
  const token = signToken(opts.piece.nfc_uid, opts.piece.id);
  const verifyUrl = `${opts.siteUrl.replace(/\/$/, "")}/v/${opts.piece.nfc_uid}?t=${token}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, {
    errorCorrectionLevel: "H",
    margin: 0,
    color: { dark: "#0a0a09", light: "#ffffff" },
    width: 512,
  });
  const qrImage = await pdf.embedPng(qrPng);
  // White card under the QR so it scans against the dark background
  const qrPad = 2 * MM;
  const qrX = PAGE_WIDTH - SAFE_MARGIN - QR_SIZE;
  const qrY = SAFE_MARGIN;
  page.drawRectangle({
    x: qrX - qrPad,
    y: qrY - qrPad,
    width: QR_SIZE + 2 * qrPad,
    height: QR_SIZE + 2 * qrPad,
    color: INK_LIGHT,
  });
  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: QR_SIZE,
    height: QR_SIZE,
  });
}

function drawBack(
  pdf: PDFDocument,
  fonts: CardFonts,
  opts: GenerateCardOptions,
): void {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: INK_DARK,
  });

  // "Authenticity" label
  page.drawText("AUTHENTICITY", {
    x: SAFE_MARGIN,
    y: PAGE_HEIGHT - SAFE_MARGIN - 10,
    size: 6.5,
    font: fonts.sansRegular,
    color: PRIMARY,
  });

  // EN notice
  let y = PAGE_HEIGHT - SAFE_MARGIN - 28;
  const noticeWidth = PAGE_WIDTH - 2 * SAFE_MARGIN;
  for (const line of wrapToLines(opts.notices.en, fonts.sansRegular, 9, noticeWidth)) {
    page.drawText(line, {
      x: SAFE_MARGIN,
      y,
      size: 9,
      font: fonts.sansRegular,
      color: INK_LIGHT,
    });
    y -= 12;
  }

  // FR notice
  y -= 8;
  for (const line of wrapToLines(opts.notices.fr, fonts.sansRegular, 9, noticeWidth)) {
    page.drawText(line, {
      x: SAFE_MARGIN,
      y,
      size: 9,
      font: fonts.sansRegular,
      color: INK_LIGHT,
    });
    y -= 12;
  }

  // AR notice — pdf-lib has no shaping/bidi engine, so we shape the
  // Arabic letters into Presentation Forms-B (FE70–FEFF, which the
  // Noto Sans Arabic cmap maps directly to connected glyphs) and
  // then reorder each wrapped line for RTL drawing. Verified via the
  // smoke script + pdf-parse round-trip (Phase 3 chore commit).
  y -= 8;
  const shapedAr = shapeArabic(opts.notices.ar);
  for (const line of wrapToLines(
    shapedAr,
    fonts.arabicRegular,
    9,
    noticeWidth,
  )) {
    const visual = toRtlVisualOrder(line);
    const w = fonts.arabicRegular.widthOfTextAtSize(visual, 9);
    page.drawText(visual, {
      x: PAGE_WIDTH - SAFE_MARGIN - w,
      y,
      size: 9,
      font: fonts.arabicRegular,
      color: INK_LIGHT,
    });
    y -= 12;
  }

  // Metadata block — sculpt/paint dates, edition info
  y -= 16;
  page.drawLine({
    start: { x: SAFE_MARGIN, y: y + 4 },
    end: { x: PAGE_WIDTH - SAFE_MARGIN, y: y + 4 },
    thickness: 0.5,
    color: INK_MUTED,
  });
  y -= 10;

  drawMetaPair(
    page,
    fonts,
    "SCULPT",
    opts.piece.sculpt_date,
    SAFE_MARGIN,
    y,
  );
  drawMetaPair(
    page,
    fonts,
    "PAINT",
    opts.piece.paint_date,
    PAGE_WIDTH / 2,
    y,
  );
  y -= 24;

  if (opts.piece.edition_number !== null && opts.piece.edition_total !== null) {
    drawMetaPair(
      page,
      fonts,
      "EDITION",
      `${opts.piece.edition_number} / ${opts.piece.edition_total}`,
      SAFE_MARGIN,
      y,
    );
  }
  drawMetaPair(
    page,
    fonts,
    "PIECE",
    `#${pad4(opts.piece.piece_number)}`,
    PAGE_WIDTH / 2,
    y,
  );
  y -= 22;

  // Specs block — only render rows with a value. If no specs are filled,
  // the section is omitted entirely so the card layout regresses to
  // exactly the pre-Phase-5-prep design (no empty header, no shift).
  drawSpecsBlock(page, fonts, opts.piece, y);

  // Support email — bottom
  drawCenteredText(
    page,
    opts.notices.supportEmail,
    fonts.sansRegular,
    8,
    SAFE_MARGIN,
    INK_MUTED,
  );
}

function formatSpecNumber(value: number): string {
  return value.toFixed(1);
}

function specRows(
  piece: GenerateCardOptions["piece"],
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (piece.height_mm !== null) {
    rows.push({ label: "HEIGHT", value: `${formatSpecNumber(piece.height_mm)} mm` });
  }
  if (piece.base_width_mm !== null) {
    rows.push({ label: "BASE", value: `${formatSpecNumber(piece.base_width_mm)} mm` });
  }
  if (piece.weight_g !== null) {
    rows.push({ label: "WEIGHT", value: `${formatSpecNumber(piece.weight_g)} g` });
  }
  if (piece.scale) {
    rows.push({ label: "SCALE", value: piece.scale });
  }
  if (piece.material) {
    rows.push({ label: "MATERIAL", value: piece.material });
  }
  if (piece.variant_label) {
    rows.push({ label: "VARIANT", value: piece.variant_label });
  }
  return rows;
}

function drawSpecsBlock(
  page: PDFPage,
  fonts: CardFonts,
  piece: GenerateCardOptions["piece"],
  startY: number,
): void {
  const rows = specRows(piece);
  if (rows.length === 0) return;

  // Three-column grid; rows of (label small caps, value mono) stacked
  // below each other. Two rows of three columns gives a 6-cell capacity
  // which exactly fits the spec field set, so a fully-populated piece
  // renders in a single tight block without paging.
  const columns = 3;
  const colWidth = (PAGE_WIDTH - 2 * SAFE_MARGIN) / columns;
  const rowGap = 18;
  const maxValueWidth = colWidth - 4;

  let y = startY;
  rows.forEach((row, i) => {
    const col = i % columns;
    if (col === 0 && i > 0) {
      y -= rowGap;
    }
    const x = SAFE_MARGIN + col * colWidth;
    page.drawText(row.label, {
      x,
      y,
      size: 5.5,
      font: fonts.sansRegular,
      color: PRIMARY,
    });
    const clipped = clipToWidth(row.value, fonts.monoRegular, 8, maxValueWidth);
    page.drawText(clipped, {
      x,
      y: y - 9,
      size: 8,
      font: fonts.monoRegular,
      color: INK_LIGHT,
    });
  });
}

function drawMetaPair(
  page: PDFPage,
  fonts: CardFonts,
  label: string,
  value: string,
  x: number,
  y: number,
): void {
  page.drawText(label, {
    x,
    y,
    size: 6.5,
    font: fonts.sansRegular,
    color: PRIMARY,
  });
  page.drawText(value, {
    x,
    y: y - 12,
    size: 11,
    font: fonts.monoRegular,
    color: INK_LIGHT,
  });
}
