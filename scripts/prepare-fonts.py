#!/usr/bin/env python3
"""
Prepare the card-PDF TTFs: pin variable axes to a single static weight,
then subset to just the glyph ranges the card actually draws and drop
the OpenType layout tables (GSUB, GPOS, GDEF, …).

Why both passes are needed: pdf-lib 1.17.1 (with @pdf-lib/fontkit 1.1.1)
has two interacting bugs.

  1. Its subsetter mis-renumbers glyph IDs for variable fonts AND for
     static fonts that carry GSUB/GPOS layout tables, so most characters
     render as the wrong glyph (or as nothing). Symptoms: "Nachi3D"
     rendered as "i3D" then "ach"; "Test Subject" as "T   Subj  c"; etc.

  2. Therefore the PDF route has to embed fonts with `subset: false` —
     which would normally inflate the cached card from ~36 KB to ~2 MB.

The fix is to pre-subset the TTFs here, then ship them as plain static
fonts with no layout tables. pdf-lib then embeds them whole without
running its subsetter, the cards render correctly, and the file size
stays small (~250 KB per card).

Run with:  python scripts/prepare-fonts.py
Requires:  Python 3, fontTools  (pip install fonttools)

fetch-fonts.ts runs this automatically as its last step, so the normal
upgrade flow is just `npm run fetch:fonts`. Run this directly when
iterating on the subset ranges below.

Idempotent. Re-running on already-prepared TTFs subsets the (already
trimmed) glyph set down to the same set again; output is stable.
"""

from __future__ import annotations
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Subsetter, Options

FONT_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"

# Glyph ranges every Latin/serif/mono font has to keep. Covers basic
# ASCII plus the typographic punctuation the card draws (curly quotes,
# em dash, ellipsis, fancy apostrophe).
LATIN_RANGES = [
    (0x0020, 0x007E),  # ASCII printable
    (0x00A0, 0x00FF),  # Latin-1 supplement (â, é, ç…)
    (0x2010, 0x2026),  # hyphens, en/em dashes, curly quotes, ellipsis
]

# Arabic ranges used by the back-side AR notice. The card shaper maps
# joining Arabic letters into Presentation Forms-B (FE70–FEFF), but
# keeps combining marks (shaddah, kasra, fatha…) and punctuation in
# their U+0600–U+06FF positions, so we keep the whole Arabic block. We
# keep Latin ranges too because the AR notice contains embedded Latin
# runs ("Nachi3D", "NFC", "QR", "verify.nachi3dlabs.com") drawn with the
# same Noto Sans Arabic font.
ARABIC_RANGES = LATIN_RANGES + [
    (0x0600, 0x06FF),  # arabic block (letters + harakat + punctuation)
    (0xFE70, 0xFEFF),  # arabic presentation forms-B (shaped output)
]

# (filename, axis_values, glyph_ranges)
JOBS: list[tuple[str, dict[str, float], list[tuple[int, int]]]] = [
    ("Inter-Regular.ttf",             {"wght": 400, "opsz": 14},  LATIN_RANGES),
    ("Inter-Bold.ttf",                {"wght": 700, "opsz": 14},  LATIN_RANGES),
    ("CormorantGaramond-Regular.ttf", {"wght": 400},              LATIN_RANGES),
    ("CormorantGaramond-Italic.ttf",  {"wght": 400},              LATIN_RANGES),
    ("JetBrainsMono-Regular.ttf",     {"wght": 400},              LATIN_RANGES),
    ("NotoSansArabic-Regular.ttf",    {"wght": 400, "wdth": 100}, ARABIC_RANGES),
]


def codepoints(ranges: list[tuple[int, int]]) -> list[int]:
    out: list[int] = []
    for lo, hi in ranges:
        out.extend(range(lo, hi + 1))
    return out


def prepare_one(filename: str, axes: dict[str, float], ranges: list[tuple[int, int]]) -> None:
    path = FONT_DIR / filename
    if not path.exists():
        print(f"SKIP {filename}: not present in {FONT_DIR}", file=sys.stderr)
        return

    font = TTFont(path)

    if "fvar" in font:
        font = instantiateVariableFont(font, axes, inplace=False)

    opts = Options()
    # Drop every layout/colour/variation table — pdf-lib doesn't need
    # them for the card and the layout tables specifically break its
    # subsetter (we keep `subset: false` on the embed call regardless).
    opts.layout_features = []
    opts.drop_tables += ["GSUB", "GPOS", "GDEF", "BASE", "JSTF", "STAT", "MATH", "COLR", "CPAL"]
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    opts.name_languages = ["*"]
    opts.glyph_names = True
    opts.recommended_glyphs = True
    opts.notdef_glyph = True
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.recalc_timestamp = False

    subsetter = Subsetter(options=opts)
    subsetter.populate(unicodes=codepoints(ranges))
    subsetter.subset(font)

    font.save(path)
    font.close()
    size_kb = path.stat().st_size / 1024
    pretty_axes = ", ".join(f"{k}={v}" for k, v in axes.items()) or "—"
    print(f"OK   {filename}: axes [{pretty_axes}] subset to {len(codepoints(ranges))} cps -> {size_kb:.0f} KB")


def main() -> int:
    if not FONT_DIR.is_dir():
        print(f"ERROR: {FONT_DIR} does not exist", file=sys.stderr)
        return 1
    for filename, axes, ranges in JOBS:
        prepare_one(filename, axes, ranges)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
