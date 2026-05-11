import "server-only";

/**
 * Minimal Arabic shaper + RTL bidi reordering for pdf-lib.
 *
 * Why this exists: pdf-lib's drawText() does NOT apply OpenType GSUB
 * substitutions, so passing logical-order Arabic Unicode (U+0600–U+06FF)
 * renders each letter in its isolated form — disconnected glyphs that
 * look broken to native readers. We sidestep that by mapping every
 * Arabic letter to its corresponding Presentation Forms-B glyph
 * (U+FE70–U+FEFF) based on join context, plus the four lam-alef
 * ligatures (U+FEF5–U+FEFC). The Noto Sans Arabic cmap covers all of
 * these directly, so no shaping engine is required at render time.
 *
 * For mixed-direction lines (Arabic with embedded Latin tokens like
 * "Nachi3D" or "verify.nachi3dlabs.com"), pdf-lib also has no bidi engine.
 * toRtlVisualOrder() does a small, pragmatic UAX#9-flavoured reorder:
 * runs of Arabic chars are internally reversed and the run *order* is
 * reversed for the RTL paragraph direction. Latin runs keep their
 * internal order. Neutrals (whitespace/punctuation) attach to the most
 * recent strong direction.
 *
 * If we ever need correct rendering for Hebrew, Persian-only digits,
 * or multi-paragraph mixed scripts, swap this for harfbuzzjs.
 */

interface JoiningInfo {
  /** [isolated, final, initial?, medial?] presentation-form code points. */
  forms: readonly number[];
  /** This letter joins to the next letter (i.e. "dual joining"). */
  joinsForward: boolean;
}

const TABLE: Record<number, JoiningInfo> = {
  // Right-joining only (2 forms)
  0x0622: { forms: [0xfe81, 0xfe82], joinsForward: false }, // آ
  0x0623: { forms: [0xfe83, 0xfe84], joinsForward: false }, // أ
  0x0624: { forms: [0xfe85, 0xfe86], joinsForward: false }, // ؤ
  0x0625: { forms: [0xfe87, 0xfe88], joinsForward: false }, // إ
  0x0627: { forms: [0xfe8d, 0xfe8e], joinsForward: false }, // ا
  0x0629: { forms: [0xfe93, 0xfe94], joinsForward: false }, // ة
  0x062f: { forms: [0xfea9, 0xfeaa], joinsForward: false }, // د
  0x0630: { forms: [0xfeab, 0xfeac], joinsForward: false }, // ذ
  0x0631: { forms: [0xfead, 0xfeae], joinsForward: false }, // ر
  0x0632: { forms: [0xfeaf, 0xfeb0], joinsForward: false }, // ز
  0x0648: { forms: [0xfeed, 0xfeee], joinsForward: false }, // و
  0x0649: { forms: [0xfeef, 0xfef0], joinsForward: false }, // ى

  // Dual-joining (4 forms)
  0x0626: { forms: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], joinsForward: true }, // ئ
  0x0628: { forms: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], joinsForward: true }, // ب
  0x062a: { forms: [0xfe95, 0xfe96, 0xfe97, 0xfe98], joinsForward: true }, // ت
  0x062b: { forms: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], joinsForward: true }, // ث
  0x062c: { forms: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], joinsForward: true }, // ج
  0x062d: { forms: [0xfea1, 0xfea2, 0xfea3, 0xfea4], joinsForward: true }, // ح
  0x062e: { forms: [0xfea5, 0xfea6, 0xfea7, 0xfea8], joinsForward: true }, // خ
  0x0633: { forms: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], joinsForward: true }, // س
  0x0634: { forms: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8], joinsForward: true }, // ش
  0x0635: { forms: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], joinsForward: true }, // ص
  0x0636: { forms: [0xfebd, 0xfebe, 0xfebf, 0xfec0], joinsForward: true }, // ض
  0x0637: { forms: [0xfec1, 0xfec2, 0xfec3, 0xfec4], joinsForward: true }, // ط
  0x0638: { forms: [0xfec5, 0xfec6, 0xfec7, 0xfec8], joinsForward: true }, // ظ
  0x0639: { forms: [0xfec9, 0xfeca, 0xfecb, 0xfecc], joinsForward: true }, // ع
  0x063a: { forms: [0xfecd, 0xfece, 0xfecf, 0xfed0], joinsForward: true }, // غ
  0x0641: { forms: [0xfed1, 0xfed2, 0xfed3, 0xfed4], joinsForward: true }, // ف
  0x0642: { forms: [0xfed5, 0xfed6, 0xfed7, 0xfed8], joinsForward: true }, // ق
  0x0643: { forms: [0xfed9, 0xfeda, 0xfedb, 0xfedc], joinsForward: true }, // ك
  0x0644: { forms: [0xfedd, 0xfede, 0xfedf, 0xfee0], joinsForward: true }, // ل
  0x0645: { forms: [0xfee1, 0xfee2, 0xfee3, 0xfee4], joinsForward: true }, // م
  0x0646: { forms: [0xfee5, 0xfee6, 0xfee7, 0xfee8], joinsForward: true }, // ن
  0x0647: { forms: [0xfee9, 0xfeea, 0xfeeb, 0xfeec], joinsForward: true }, // ه
  0x064a: { forms: [0xfef1, 0xfef2, 0xfef3, 0xfef4], joinsForward: true }, // ي
};

/** Lam (U+0644) followed by an alef variant collapses into one glyph. */
const LAM_ALEF: Record<number, [number, number]> = {
  // Format: [isolated/initial-form-of-ligature, final/medial-form-of-ligature]
  0x0622: [0xfef5, 0xfef6], // ل + آ
  0x0623: [0xfef7, 0xfef8], // ل + أ
  0x0625: [0xfef9, 0xfefa], // ل + إ
  0x0627: [0xfefb, 0xfefc], // ل + ا
};

function isTransparent(cp: number): boolean {
  // Arabic combining marks (harakat etc) — don't break joining.
  return (
    (cp >= 0x064b && cp <= 0x065f) ||
    cp === 0x0670 ||
    (cp >= 0x06d6 && cp <= 0x06ed) ||
    (cp >= 0x0610 && cp <= 0x061a)
  );
}

function findPrev(codes: readonly number[], i: number): number {
  for (let j = i - 1; j >= 0; j--) {
    const cp = codes[j];
    if (cp === undefined) continue;
    if (isTransparent(cp)) continue;
    return TABLE[cp] ? j : -1;
  }
  return -1;
}

function findNext(codes: readonly number[], i: number): number {
  for (let j = i + 1; j < codes.length; j++) {
    const cp = codes[j];
    if (cp === undefined) continue;
    if (isTransparent(cp)) continue;
    return TABLE[cp] ? j : -1;
  }
  return -1;
}

function pickForm(
  info: JoiningInfo,
  joinsBack: boolean,
  joinsForward: boolean,
): number {
  const f = info.forms;
  // Right-joining letters have only [isolated, final].
  if (f.length === 2) {
    return joinsBack ? (f[1] ?? f[0]!) : f[0]!;
  }
  // Dual-joining letters have [isolated, final, initial, medial].
  if (joinsBack && joinsForward) return f[3] ?? f[1] ?? f[0]!;
  if (joinsBack) return f[1] ?? f[0]!;
  if (joinsForward) return f[2] ?? f[0]!;
  return f[0]!;
}

/**
 * Map each Arabic code point to its context-appropriate presentation
 * form, handling lam-alef ligatures. Non-Arabic text passes through
 * unchanged. Output is still in *logical* order — see toRtlVisualOrder
 * for the bidi reorder needed before drawing.
 */
export function shapeArabic(text: string): string {
  const codes = [...text].map((c) => c.codePointAt(0)!);
  const out: number[] = [];

  let i = 0;
  while (i < codes.length) {
    const cp = codes[i]!;

    // Lam + alef ligature lookahead
    if (cp === 0x0644) {
      let nextIdx = i + 1;
      while (
        nextIdx < codes.length &&
        codes[nextIdx] !== undefined &&
        isTransparent(codes[nextIdx]!)
      ) {
        nextIdx++;
      }
      const nextCp = codes[nextIdx];
      if (nextCp !== undefined && LAM_ALEF[nextCp]) {
        const ligature = LAM_ALEF[nextCp]!;
        const prevIdx = findPrev(codes, i);
        const lamJoinsBack =
          prevIdx >= 0 &&
          (TABLE[codes[prevIdx]!]?.joinsForward ?? false);
        out.push(lamJoinsBack ? ligature[1] : ligature[0]);
        i = nextIdx + 1;
        continue;
      }
    }

    const info = TABLE[cp];
    if (!info) {
      out.push(cp);
      i++;
      continue;
    }

    const prevIdx = findPrev(codes, i);
    const nextIdx = findNext(codes, i);
    const joinsBack =
      prevIdx >= 0 && (TABLE[codes[prevIdx]!]?.joinsForward ?? false);
    const joinsForward = info.joinsForward && nextIdx >= 0;
    out.push(pickForm(info, joinsBack, joinsForward));
    i++;
  }

  return String.fromCodePoint(...out);
}

type Direction = "ar" | "ltr";

function classifyChar(cp: number): Direction | "neutral" {
  if (
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfeff)
  ) {
    return "ar";
  }
  if (
    (cp >= 0x41 && cp <= 0x5a) ||
    (cp >= 0x61 && cp <= 0x7a) ||
    (cp >= 0x30 && cp <= 0x39)
  ) {
    return "ltr";
  }
  return "neutral";
}

interface Run {
  kind: Direction;
  text: string;
}

function tokenize(text: string): Run[] {
  const runs: Run[] = [];
  let bufKind: Direction | null = null;
  let buf = "";
  let lastStrong: Direction = "ar"; // RTL paragraph default

  for (const ch of [...text]) {
    const c = classifyChar(ch.codePointAt(0)!);
    let dir: Direction;
    if (c === "neutral") {
      dir = lastStrong;
    } else {
      dir = c;
      lastStrong = c;
    }
    if (bufKind === null) {
      bufKind = dir;
      buf = ch;
    } else if (bufKind === dir) {
      buf += ch;
    } else {
      runs.push({ kind: bufKind, text: buf });
      bufKind = dir;
      buf = ch;
    }
  }
  if (bufKind !== null && buf.length > 0) {
    runs.push({ kind: bufKind, text: buf });
  }
  return runs;
}

/**
 * Reorder a (possibly-shaped) line into the LTR drawing order that
 * pdf-lib will render as visual right-to-left text — Arabic runs read
 * right-to-left, embedded Latin runs (e.g. brand names, URLs) stay LTR.
 *
 *   Logical:  "أصالة قطعة Nachi3D"
 *   After shape: "ﺃﺻﺎﻟﺔ ﻗﻄﻌﺔ Nachi3D"
 *   After this fn → drawing order: "Nachi3D ﺔﻌﻄﻗ ﺔﻟﺎﺻﺃ"
 *   pdf-lib draws L→R; reader sees properly RTL Arabic with Latin
 *   embedded the right way round.
 *
 * Pass shaped input. Width (for right-alignment) is identical
 * before and after — reordering doesn't change widths.
 */
export function toRtlVisualOrder(shaped: string): string {
  const runs = tokenize(shaped);
  for (const run of runs) {
    if (run.kind === "ar") {
      run.text = [...run.text].reverse().join("");
    }
  }
  runs.reverse();
  return runs.map((r) => r.text).join("");
}

/**
 * One-shot: shape Arabic letters then reorder for RTL drawing.
 */
export function shapeAndReorderRtl(text: string): string {
  return toRtlVisualOrder(shapeArabic(text));
}
