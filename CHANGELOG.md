# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/).

## [0.4.0] — 2026-05-13

Phase 4 — public gallery. Every published `show_in_gallery=true` piece
now has a public face at `/[locale]/gallery`, the surface meant to
drive discovery and SEO and act as marketing proof for the
certification system.

### ✨ Features

- **Public gallery at `/[locale]/gallery`.** Trilingual grid of every
  published piece, sorted `piece_number desc`. License-status chip
  filters (Originaux / Public domain / Commissions / Sous licence /
  Autre / Tout) refetch server-side; debounced client-side search on
  `character_name` filters already-loaded cards (Esc to clear).
  Infinite scroll batches of 24 via `/[locale]/api/gallery`.
- **`show_in_gallery` toggle on the admin piece form.** Checkbox on
  `/admin/pieces/[id]/edit` (default true) hides a piece from the
  public gallery while keeping `/v/[uid]` fully functional —
  decouples the showcase surface from the verification surface. The
  `/admin/pieces` list grew a `Gallery: ON / Hidden` chip next to the
  status badge.
- **SEO surface.** Dynamic `/sitemap.xml` covers the landing page,
  the gallery, and every published piece's `/v/[uid]?t=<token>` in
  all three locales — tokens are signed server-side at render time.
  `/robots.txt` allows all crawlers, disallows `/admin` + `/api`, and
  declares the sitemap.
- **Stats bar on the gallery.** Header strip surfaces the count of
  authenticated pieces and how many have been claimed.
- **Landing-page CTA to the gallery.** Secondary call-to-action on
  `/[locale]` points new visitors at `/gallery`.

### 🔧 Internal

- **Schema.** New migration `20260512000000_add_show_in_gallery.sql`
  adds a `show_in_gallery boolean not null default true` column on
  `pieces`, backfills existing rows, and creates a composite index on
  `(status, show_in_gallery, piece_number DESC)` covering the gallery
  query path in one go.
- **`npm run purge:cards`.** New maintenance utility wipes every
  cached certificate-card PDF in the `cards` storage bucket. Use it
  after a shared content change to the card (verification domain,
  copy, layout, fonts), since `invalidateCardCache()` only fires on
  per-piece updates. Same project-ref defensive interlock as
  `db:seed`.
- **Fix `uidLocked` propagation in `PieceForm`.** When a piece is
  published, the `nfc_uid` input is disabled — which excluded it
  from `FormData`, so `piecePatchSchema` saw `nfc_uid=""` and
  rejected the patch before reaching the DB. The locked input is now
  renamed (`nfc_uid__locked_display`) and the real value ships via a
  sibling hidden input. Surfaced by the new admin gallery-toggle
  test, which exercises a toggle-only edit on a published piece.
- **E2E timeouts adjusted for remote Supabase latency.** The default
  5 s assertion budget races with server-action round trips against
  the remote project (revalidatePath + DB write routinely 5+ s on
  cold-compiled routes). Specific assertions in `gallery.spec.ts`
  bumped to 15 s; `admin-pieces.spec.ts:37` (register-then-verify
  roundtrip) bumped to 60 s for the cold-compile path.

## [0.3.0] — 2026-05-11

Phase 3.5 — brand palette rollout across every surface, drag-and-drop
photo uploads, and a pile of PDF-card fixes uncovered the first time
we actually opened the generated cards in a viewer.

### ✨ Features

- **Brand palette across the app.** Every surface now matches the
  nachi3d.com palette (violet primary, orange accent). Theme tokens
  and self-hosted Inter / Cormorant Garamond / JetBrains Mono / Noto
  Sans Arabic live in `app/[locale]/globals.css` and `public/fonts/`.
  Verification page gets a violet→orange gradient on the piece number;
  landing, admin surfaces, and the claim placeholder pick up the same
  tokens. Certificate-card PDF swaps the old brass accent for the
  primary violet.
- **Drag-and-drop OS files on the photo uploader.** Admin piece
  editor's photo picker now accepts files dropped from Finder /
  Explorer, not only the click-to-browse path.
- **`npm run dev:signin`.** New `scripts/dev-signin.ts` runs the
  test-only password signin against a local dev server for quick
  manual smoke-testing without going through magic-link email.

### 🐛 Bug fixes

- **PDF card text was unreadable in viewers.** `pdf-lib` 1.17.1's
  subsetter mis-renumbers glyph IDs for variable fonts and for static
  fonts carrying GSUB/GPOS layout tables, so Latin runs ("Nachi3D",
  "Test Subject", the back-page notice) rendered as scrambled glyphs
  on the printed card even though `pdf-parse` extracted clean text via
  the ToUnicode tables. Fix: pre-subset the OFL TTFs to static,
  layout-free WOFF2-equivalents via a new
  `scripts/prepare-fonts.py` (fontTools) and load those instead. A
  glyph-integrity assertion in `tests/e2e/cards.spec.ts` now fails
  loudly if any future font swap regresses this.
- **Card downloads now force `.pdf` filenames.** The "Generate card
  PDF" link previously inherited the route segment as the filename in
  some browsers, dropping the extension. `Content-Disposition` now
  pins `filename="nachi3d-certify-piece-XXXX.pdf"` and an e2e test
  drives a real click to assert the downloaded blob lands with the
  `.pdf` suffix.
- **`seed-remote` is deterministic across re-runs.** The helper now
  purges non-seed pieces in addition to upserting the canonical one,
  so re-running the Playwright suite against the hosted DB doesn't
  pile up orphan rows from previous runs.

### 🔧 Internal

- New regression test in `tests/e2e/cards.spec.ts` drives a real
  click on the admin card link and asserts the download triggers
  with the correct `.pdf` filename and viewable Latin glyphs — the
  pair of checks that would have caught the v0.2.0 PDF rendering bug
  earlier if we had been opening the generated PDFs.

## [0.2.0] — 2026-05-07

Phase 3 — print-ready certificate cards, verification page polish, and
the switch to a remote-only Supabase workflow.

### Features

- **PDF certificate cards.** A6 print-ready cards generated by
  `pdf-lib` at `GET /api/admin/cards/[id]`, cached in the new `cards`
  storage bucket and invalidated on any piece edit. Real-typography
  output (Inter, Cormorant Garamond, JetBrains Mono, Noto Sans Arabic
  — all SIL OFL 1.1, committed to `public/fonts/`).
- **Verification page polish.** Hero carousel, provenance timeline,
  authenticated seal, character-quote pull-quote, and a claim CTA on
  unowned pieces. Open Graph + Twitter card meta on valid tokens; the
  tamper page leaks zero piece data.
- **i18n.** EN/FR/AR translations for every Phase 3 surface.
- **Arabic typography in cards.** Joining-form shaping + RTL bidi
  reorder so the back-side notice prints correctly.
- **Test seeding for the remote-only workflow.** New
  `scripts/seed-remote.ts` (idempotent service-role admin API) seeds
  the test admin/collector users and the canonical published piece on
  the hosted DB. Wired into Playwright `globalSetup` so the e2e suite
  runs end-to-end against the remote.

### Fixes

- **i18n placeholder substitution.** `verify.editionShort` ("{n}/{total}")
  is now formatted via `t(key, values)` instead of the broken
  `t(key).replace(...)` pattern that fell back to the literal key on
  next-intl v3.
- **RLS recursion on `profiles`.** Drop the self-referencing
  `profiles_select_admin` policy that triggered "infinite recursion
  detected in policy" on PG17 and broke the entire admin gate.
  `profiles_select_self` already covers every read site we have today.
- **Card PDF Arabic shaping** — joining/RTL pass on the back-side notice.

### Internal

- **Switch to remote-only Supabase.** No local Docker stack. Migrations
  apply with `npm run db:push` (replaces `db:migrate`); destructive
  replays use `npm run db:reset` which wraps `supabase db reset
  --linked`. README and CLAUDE.md document the policy.
- New scripts: `npm run db:push`, `npm run db:reset`, `npm run db:seed`.
- `supabase/config.toml` major_version bumped to 17 to match the hosted
  project; `supabase/snippets/` is now gitignored (Studio scratch
  often contains secrets).
- Production env-var checklist in README (Cloudflare Pages).
- Expanded e2e coverage: cards.spec.ts (PDF happy path, cache HIT,
  403/401 gates) and OG/tamper assertions in verification.spec.ts.

### Schema

- `20260503000003_storage_cards.sql` — new `cards` storage bucket with
  admin-only write, public read.
- `20260503000002_verification_token_function.sql` — Postgres mirror of
  `signToken()` for stored tokens (the runtime always recomputes; this
  is reference only).
- `20260507000000_fix_profiles_admin_recursion.sql` — drop the
  recursive RLS policy.

## [0.1.0] — Phase 1 + 2 baseline

Initial schema, RLS, HMAC verification, admin piece registration,
photo uploads, i18n scaffold. Not separately released.
