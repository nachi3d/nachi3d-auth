# CLAUDE.md — Nachi3D Certify

Next.js 15 + Supabase web app for authenticating Nachi3D resin figurines.
Public verification via NFC + QR. Trilingual FR/EN/AR with RTL support.
Repo slug: `nachi3d-auth`. Public name: **Nachi3D Certify**.

## Git Workflow

| Branch | Purpose | Who pushes |
|---|---|---|
| `main` | Stable production snapshots | User only (after review) |
| `dev` | Integration branch | User + Claude merges |
| `claude/<name>` | Feature branches | Claude only |

### Shell Command Policy

Claude Code requires approval for compound commands combining `cd` and `git`.
To avoid confirmation pauses, always run `cd` and `git` as separate commands:

**Never:**
```
cd some/path && git checkout dev
```

**Always:**
```
cd some/path
git checkout dev
```

All git commands must be run from the project root directly.
The working directory is always the project root.

## Contributing Process

```bash
# 1. Start from dev
git checkout dev
git pull

# 2. Create feature branch
git checkout -b claude/<feature-name>

# 3. Make changes, then commit (NO Co-Authored-By for Nachi3D repos)
git add <files>
git commit -m "feat(<scope>): description"

# 4. Push feature branch
git push -u origin claude/<feature-name>

# 5. After user approval, merge + delete in one flow
git checkout dev
git pull
git merge --no-ff claude/<feature-name>
git push origin dev

# MANDATORY cleanup — a merged branch is a deletable branch
git branch -d claude/<feature-name>
git push origin --delete claude/<feature-name>
```

### Commit Attribution Policy (Nachi3D-specific)

**All commits authored as `nachi3D` only.** Unlike MangaTrack and other
personal repos, Nachi3D-owned repos do **not** include `Co-Authored-By`
lines for Claude or any other AI. No Claude attribution in:

- Commit messages (no `Co-Authored-By`, no `🤖 Generated with Claude Code` etc.)
- Code comments
- README files
- Documentation

This is non-negotiable. If you're unsure whether to add an attribution
line, the answer is no.

### Branch Hygiene Policy

Every feature branch has exactly one lifecycle: **create → work → merge into dev → delete immediately**. There is no "keep it around for a while" state.

- Claude Code **must** delete the feature branch (local + remote) as the final step of any merge. If Claude Code is asked to merge but cannot delete (e.g. branch has unpushed work), it must flag that explicitly instead of silently skipping the delete.
- The only branches that should exist at any time are: `main`, `dev`, and at most one active `claude/<feature-name>`.
- **Exception:** if a branch is explicitly marked "keep" by the user, skip deletion. Default is always delete.

## Production Testing Policy

Before ANY merge to `main`:

1. All changes must work in `npm run dev` first
2. Build a production bundle: `npm run build`
3. Smoke-test locally: `npm run start`
4. Verify against a Vercel preview deployment from the `dev` branch
5. Only THEN bump version and merge `dev` → `main`

**Why:** Vercel preview builds run on the same runtime split as
production — Node.js serverless functions for routes, Vercel Edge
Runtime (V8 isolates, not Node) for middleware. Local `next dev` is
all-Node, so middleware code can pass locally and fail on the preview
(Node-only APIs, missing polyfills). Test on the preview deploy before
promoting to main.

Main branch must always be deployable. If a broken build reaches `main`,
revert immediately with `git reset --hard` to the last known working tag.

### Dev Preview Deployment

Vercel auto-deploys every push to `dev` to a preview URL (the
project's `dev` branch alias, typically
`nachi3d-auth-git-dev-<team>.vercel.app`). Before requesting a merge
to `main`, verify the preview URL renders correctly:

1. Public verification page (`/v/<seeded-uid>?t=<token>`)
2. Tamper page (invalid token)
3. Admin gate redirects unauthenticated users
4. All three locales (`/en/...`, `/fr/...`, `/ar/...`) render with correct direction (LTR for EN/FR, RTL for AR)

This is MANDATORY before any merge to main.

## Release Process

1. Bump versions on `dev` (see Pre-merge version bump check below)
2. Merge `dev` → `main` → push
3. GitHub Actions workflow `ci.yml` fires on push to `main`:
   - Runs `npm run verify` (lint + typecheck + build)
   - Runs `npm run test:e2e` against a built preview
4. Vercel auto-deploys `main` to `verify.nachi3dlabs.com`
5. Verify production renders correctly (same checklist as dev preview)

### Pre-merge version bump check

Before merging `dev` → `main`, Claude Code **must**:

1. Bump `version` in `package.json` (semver: patch for fixes, minor for
   features, major for breaking changes or schema migrations that
   require manual data fixup)
2. Add a `CHANGELOG.md` entry under the new version with grouped sections:
   - ✨ Features
   - 🐛 Bug fixes
   - 🔧 Internal
   - ⚠️ Breaking changes (if any)
3. Commit as `chore(release): vX.Y.Z` on `dev` before the merge

This is mandatory. Never merge `dev` → `main` without bumping versions
and updating the changelog first.

### Merging dev → main

```bash
git checkout main
git pull origin main
git merge --no-ff dev -m "Merge branch 'dev' — vX.Y.Z

## What's new
### ✨ Features
- feat(scope): one-line summary

### 🐛 Bug fixes
- fix(scope): one-line summary

### 🔧 Internal
- chore/refactor entries if any"

git push origin main
git checkout dev
```

Read `git log main..dev` before writing the merge message.

## Commit Convention

Format: `type(scope): description`

| Type | When |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance, deps |
| `docs` | Documentation only |
| `refactor` | Code restructure, no behavior change |
| `test` | Tests only |

Common scopes: `verify`, `admin`, `auth`, `i18n`, `db`, `pdf`, `nfc`,
`ui`, `analytics`, `release`.

Examples:
```
feat(verify): render piece number and character quote on /v/[uid]
fix(i18n): correct RTL direction on Arabic admin sidebar
chore(db): add migration for verification_logs index
```

## Key Architecture Notes

- **Framework** — Next.js 15, App Router, TypeScript strict mode.
- **Styling** — Tailwind CSS v4. No component libraries; build small,
  composable primitives in `components/ui/`.
- **i18n** — `next-intl` with locale segments in URL (`/en/...`,
  `/fr/...`, `/ar/...`). Middleware sets direction (`dir="rtl"` for
  `ar`).
- **Database** — Supabase Postgres. All schema changes go through
  versioned migrations in `supabase/migrations/`. Never edit the
  remote schema by hand.
- **Auth** — Supabase Auth via `@supabase/ssr` (cookie-based sessions).
  Admin sign-in is email + password against `/[locale]/login`; magic-link
  flow ships in Phase 5 for the public claim/transfer surface. Admin
  access is gated by `profiles.is_admin`. See "Admin auth (Phase 5-prep)"
  below for operational notes.
- **Storage** — Supabase Storage bucket `piece-photos` for figurine
  images. Public read, admin-only write.
- **HMAC** — `HMAC-SHA256(HMAC_SECRET, "<nfc_uid>:<piece_id>")`
  (colon-separated payload, exactly the format in `lib/hmac.ts`),
  truncated to the first 24 hex chars. Constant-time compare on
  verification, after a format check rejects malformed candidates.
  Generate URLs with `npm run sign -- <nfc_uid> <piece_id>`, which
  imports the same `signToken()` helper as the runtime — never
  reimplement the HMAC outside `lib/hmac.ts`.
- **Vercel headers** — verification logs read `x-vercel-ip-country`
  for `ip_country` and `x-vercel-ip-country-region` (with a fallback
  to `x-vercel-ip-city`) for `ip_region`. Available only when
  deployed; locally they're null and that's fine. Note that
  `x-vercel-ip-city` is URL-encoded by Vercel (spaces → `%20`); the
  log column currently stores it as-is.
- **PDF** — `pdf-lib` for card generation (Phase 3). Better Arabic/RTL
  than react-pdf.
- **Email** — Resend, configured as Supabase Auth SMTP provider
  (Phase 4).

### Data Model

```
profiles            id, display_name, country, avatar_url, is_admin,
                    created_at, updated_at

pieces              id, piece_number (unique), edition_number,
                    edition_total, nfc_uid (unique), verification_token,
                    character_name, character_quote, license_status,
                    license_notes, sculpt_date, paint_date, photos[],
                    current_owner_id, status, height_mm, base_width_mm,
                    weight_g, material, scale, variant_label,
                    created_at, updated_at

provenance_events   id, piece_id, event_type, from_owner_id,
                    to_owner_id, notes, occurred_at

verification_logs   id, piece_id, ip_country, ip_region, user_agent,
                    is_owner, occurred_at
```

### Directory Structure

```
nachi3d-auth/
  app/
    [locale]/
      v/[uid]/page.tsx          # public verification
      me/                       # owner dashboard (Phase 4)
      admin/                    # admin panel
      layout.tsx
      page.tsx                  # landing
    api/
      verify/[uid]/route.ts
      claim/route.ts            # Phase 4
      transfer/route.ts         # Phase 4
      admin/
        pieces/route.ts         # Phase 2
        cards/[id]/route.ts     # Phase 3
  components/
    verification/
    admin/
    ui/
  lib/
    supabase/
      client.ts
      server.ts
      admin.ts                  # service-role, server-only
    auth/
    hmac.ts
    pdf/
      card-generator.ts         # Phase 3
  i18n/
    en.json
    fr.json
    ar.json
  middleware.ts
  supabase/
    migrations/
    seed.sql
  tests/
    e2e/                        # Playwright
    unit/                       # Vitest
```

## Critical Features — Never Break

Before merging any branch, verify all of these still work:

| Feature | Entry point | Test |
|---|---|---|
| HMAC verification | `/v/<uid>?t=<token>` | Valid token → 200 + piece data |
| Tamper detection | `/v/<uid>?t=<bad>` | Bad token → tamper page, no piece data leak |
| Unknown UID | `/v/<unknown>?t=anything` | Generic 404 page (no schema leak) |
| Verification log entry | Any tap on `/v/<uid>` | Row inserted in `verification_logs` |
| RLS on `pieces` | Anonymous read of `status='draft'` piece | Returns null/empty |
| RLS on `verification_logs` | Anonymous SELECT via REST | Returns 401/empty |
| Admin gate | `/admin` while not logged in | Server-side redirect to `/[locale]/login` |
| Admin gate | `/admin` while logged in but `is_admin=false` | Redirect to `/[locale]/login?error=access_denied` (banner shown) |
| Admin login | Valid admin credentials on `/[locale]/login` | Redirect to `/[locale]/admin` after `signInWithPassword` |
| Admin login | Valid non-admin credentials | Server signs user out + redirects to `/[locale]/login?error=access_denied` |
| Admin login | Bad credentials | Generic "invalid credentials" error (no user-enumeration leak) |
| Admin logout | Click logout in admin top-bar | Server-side signOut + redirect to `/[locale]/login`; session cookies cleared |
| Already-authenticated admin on `/login` | GET `/[locale]/login` while signed in as admin | Redirect to `/[locale]/admin` |
| Locale routing | `/fr/v/<uid>?t=<token>` | French strings, LTR |
| Locale routing | `/ar/v/<uid>?t=<token>` | Arabic strings, RTL direction |
| NFC UID uniqueness | Insert duplicate UID | DB rejects with constraint error |
| Piece number uniqueness | Insert duplicate piece number | DB rejects with constraint error |
| Admin write — non-admin block | `POST /api/admin/pieces` as `is_admin=false` | 403 `forbidden` |
| Admin write — unauthenticated block | `POST /api/admin/pieces` with no session | 401 `unauthenticated` |
| Locked NFC UID — UI | Edit a published piece | `nfc_uid` input is disabled |
| Locked NFC UID — server | `PATCH /api/admin/pieces/[id]` with new uid on a published piece | 409 `uid_locked` |
| Verification token regeneration | Edit a draft piece's `nfc_uid` | `verification_token` is recomputed via `signToken()` |
| Photo storage gate | Anonymous read of `piece-photos` bucket | Allowed (public bucket) |
| Photo storage gate | Non-admin INSERT into `piece-photos` | Storage RLS rejects |
| Card PDF — happy path | `GET /api/admin/cards/[id]` as admin | 200, `Content-Type: application/pdf`, body starts with `%PDF-`, `Content-Disposition: attachment; filename="nachi3d-certify-piece-XXXX.pdf"` |
| Card PDF — cache | Two consecutive `GET /api/admin/cards/[id]` | Second response has `X-Cache: HIT` |
| Card PDF — invalidation | Edit any field of a piece via `updatePiece()` | Cached PDF in `cards/<id>.pdf` is removed |
| Card PDF — non-admin | `GET /api/admin/cards/[id]` as `is_admin=false` | 403 |
| Card PDF — anonymous | `GET /api/admin/cards/[id]` with no session | 401 |
| Tamper page — no data leak | Bad token on `/v/<uid>` | Response HTML contains zero `character_name`, `character_quote`, `#NNNN`, or piece OG meta — re-asserted in tests |
| OG meta on `/v/[uid]` | Valid token | `og:title`, `og:description`, `og:type`, `og:site_name`, `twitter:card` present and reference the piece |
| Gallery renders published pieces | `/[locale]/gallery` | Seeded published piece appears in the grid; draft and `show_in_gallery=false` are absent |
| Gallery `show_in_gallery=false` doesn't break verification | Same piece's `/v/<uid>?t=<token>` | Page still resolves with full data — gallery hides, verification doesn't |
| Gallery license filter | Click any license chip | Visible cards update; backend refetches with the new filter |
| Gallery search by character_name | Type in the search input | Already-loaded cards are filtered client-side, debounced |
| Gallery card → /v/[uid] | Click a card | Navigates to `/v/<uid>?t=<token>` with a valid signed token (no tamper page) |
| Gallery empty state | No published pieces | `gallery-empty` panel renders, no grid |
| Sitemap content | `GET /sitemap.xml` | Returns valid XML containing each seeded published piece's `/v/<uid>?t=<token>` in all three locales |
| Robots policy | `GET /robots.txt` | Returns 200 with `Sitemap:` declaration; disallows `/admin` + `/api` |
| Gallery OG meta | `/[locale]/gallery` HTML | `og:title`, `og:description`, `og:type=website`, hero `og:image` when any published piece has a photo |
| Admin `show_in_gallery` toggle | `/admin/pieces/[id]/edit` save | Server stores the toggle state; gallery query reflects the new value on next request |
| Hard delete — UI gate | `/admin/pieces/[id]/edit` danger zone | Modal opens; confirm button disabled until typed `piece_number` matches (leading zeros forgiven); cancel closes without deletion |
| Hard delete — server confirmation | `deletePieceAction` with mismatched `confirm_piece_number` | Returns `confirmation_mismatch`; row untouched |
| Hard delete — cascade | Confirmed delete of a draft piece | `pieces` row gone; `provenance_events` + `verification_logs` cascade-deleted via FK; cached PDF + `<id>/` photo folder cleared from storage |
| Hard delete — verification URL no longer works | `/v/<uid>?t=<token>` after the piece is deleted | No piece data is leaked (404 / unknown UID panel) |
| Hard delete — admin-only | `DELETE /api/admin/pieces/[id]` as `is_admin=false` | 403 `forbidden`; row untouched |
| Hard delete — anonymous | `DELETE /api/admin/pieces/[id]` with no session | 401 `unauthenticated`; row untouched |
| Breadcrumb — public | `/[locale]/gallery` | `breadcrumb` testid visible with `Home` → `Gallery`; first segment links to `/[locale]` |
| Breadcrumb — admin | `/[locale]/admin/pieces/[id]/edit` | `breadcrumb` testid visible with `Administration` → `Pieces` → `Edit #NNNN` (current piece number) |
| Back link — gallery referral | `/[locale]/v/[uid]?t=<token>&from=gallery` | `back-link` testid visible, `href=/[locale]/gallery` |
| Back link — direct NFC tap | `/[locale]/v/[uid]?t=<token>` (no `from`) | `back-link` is absent (customer scan path stays minimal) |
| Back link — error states | Tamper or not-found panel | `back-link` is absent even if `from=gallery` is set |
| Navigation RTL | `/ar/gallery` | breadcrumb separator flips to `‹` and `html` has `dir="rtl"` |
| Physical specs — persistence | `POST /api/admin/pieces` with `height_mm`/`weight_g`/`material`/etc. then `GET /api/admin/pieces/[id]` | All six fields round-trip; empty values stored as `NULL`, not `0` or `""` |
| Physical specs — conditional render | `/v/[uid]?t=<token>` for a piece with partial specs | Only rows whose value is non-null appear; piece with zero specs omits the section entirely |
| Physical specs — variant badge | `/v/[uid]?t=<token>` with `variant_label='Taille L'` | Prominent variant badge renders near the character name; row also appears in the specs section |
| Physical specs — PDF | `GET /api/admin/cards/[id]` for a piece with all specs filled | PDF text stream contains `HEIGHT`/`BASE`/`WEIGHT`/`MATERIAL`/`SCALE`/`VARIANT`; values like `120.5 mm`, `340.5 g` present; `SCULPT`/`PAINT`/`PIECE` still rendered; support email still anchored to the bottom |
| Physical specs — PDF unchanged when empty | `GET /api/admin/cards/[id]` for a piece with no specs | No spec labels in the PDF text; back layout matches pre-Phase-5-prep design |
| Physical specs — zod | `POST /api/admin/pieces` with `height_mm=-1` or `material` longer than 80 chars | 400 `validation_error` with `fields.height_mm` / `fields.material` populated |
| Physical specs — RTL | `/ar/v/[uid]?t=<token>` for a piece with specs | `verification-specs` section renders and `html[dir="rtl"]` is set |
| Legal — pages render | `GET /[locale]/legal/{mentions,privacy,terms}` in en/fr/ar | 200 + `legal-page-<slug>` testid visible + at least one `legal-section-*` rendered |
| Legal — last-updated | Any legal page | `legal-last-updated` testid renders the date in the locale's long-form (e.g. "May 15, 2026" / "15 mai 2026") |
| Legal — mentions disclosure | `/en/legal/mentions` HTML | Contains "Seàn McGannon", "Essaouira", "Vercel Inc.", "Supabase Inc.", "contact@nachi3d.com" |
| Legal — privacy GDPR | `/en/legal/privacy` HTML | Contains "verification_logs", "GDPR", "legitimate interest", "erasure" — the GDPR audit hits |
| Legal — terms governing law | `/en/legal/terms` HTML | Contains "Morocco" and "as-is" |
| Footer — public pages | `/[locale]`, `/[locale]/gallery`, `/[locale]/login`, `/[locale]/v/[uid]?t=<valid>` | `site-footer` testid renders below the main content |
| Footer — admin pages | `/[locale]/admin/*` while signed in | `site-footer` testid renders below the page (admin shares the same chrome) |
| Footer — absent on error states | `/v/[uid]?t=<bad>` (tamper) and `/v/<unknown>?t=…` (not-found) | `site-footer` is absent so error states stay minimal |
| Footer — locale-correct links | Footer link `site-footer-link-privacy` on `/ar` | `href="/ar/legal/privacy"` (link prefix matches the active locale) |
| Sitemap — legal | `GET /sitemap.xml` | Contains `/{en,fr,ar}/legal/{mentions,privacy,terms}` URLs alongside the existing landing + gallery + piece entries |
| Data safety — env guard | `npm run db:seed` without `ALLOW_DESTRUCTIVE_SEED=1` | Loud `[seed-remote] … skipping prune` warning; no rows deleted; canonical fixtures upserted additively |
| Data safety — fixture scope | `ALLOW_DESTRUCTIVE_SEED=1 npm run db:seed` against a DB carrying an `is_fixture=false` row | The non-fixture row survives; only non-canonical `is_fixture=true` rows are deleted |
| Data safety — admin API | POST/PATCH `/api/admin/pieces` with `is_fixture: true` in the body | Returned row has `is_fixture: false`; zod strips the field, server never reads it |

When Claude Code makes changes, it must explicitly state which of these
features were tested and confirmed working. The HMAC verification path
is the most security-critical — never modify it without re-running the
full test suite.

## Definition of Done

Before reporting any step as complete, Claude Code must:

1. Run `npm run verify` (lint + typecheck + build) and paste the output
2. Run `npm run test:e2e` and paste the output
3. Confirm all items from "Critical Features" still work (Playwright
   coverage or explicit manual verification steps)
4. Push the branch and report the commit list
5. If schema changed, confirm migration is reversible (or document why
   it isn't)

If any check fails, fix it before reporting. Do not report "done with
known issues" — either fix or explicitly ask the user how to proceed.

### Navigation aids (Phase 5-prep)

Every page deeper than the landing carries either a breadcrumb trail or
a back link, sitting above the page `<h1>`:

- `components/ui/Breadcrumb.tsx` — horizontal trail, locale- and
  RTL-aware. Earlier segments are links; the last segment is the current
  page. RTL flips the chevron (`›` → `‹`) and the natural reading order.
- `components/ui/BackLink.tsx` — single `← Back …` / `→ رجوع` link.
  Arrow direction flips under RTL.
- Public surfaces: `/gallery` carries a breadcrumb; `/v/[uid]` shows a
  back link **only** when `?from=gallery` is present (a customer
  scanning a chip never sees it). Gallery cards link with
  `?from=gallery` so the round-trip works. Tamper and not-found panels
  remain minimal — no back link.
- Admin surfaces: `/admin`, `/admin/pieces`, `/admin/pieces/new`,
  `/admin/pieces/[id]/edit` all carry breadcrumbs. `/login` does not
  (it's an entry point).
- i18n: `nav.*` keys in `i18n/{en,fr,ar}.json` (`home`, `gallery`,
  `admin`, `pieces`, `new_piece`, `edit_piece`, `back`,
  `back_to_gallery`).

## Routes & Surfaces

| Route | Purpose | Auth |
|---|---|---|
| `/[locale]` | Landing page (Nachi3D Certify intro) | Public |
| `/[locale]/v/[uid]` | Public verification page; renders the optional physical-specs section after the provenance timeline and a prominent variant badge near the character name (Phase 5-prep) | Public |
| `/[locale]/gallery` | Public gallery of published pieces (Phase 4); cards link with `?from=gallery` so verification shows a back link | Public |
| `/[locale]/login` | Admin email + password sign-in (Phase 5-prep) | Public |
| `/[locale]/me` | Owner dashboard (Phase 5) | Logged in |
| `/[locale]/admin` | Admin home | Admin only |
| `/[locale]/admin/pieces` | Paginated list with status filter + gallery badge (Phase 2 + 4) | Admin only |
| `/[locale]/admin/pieces/new` | Register piece — includes optional physical-characteristics section (height/base/weight/material/scale/variant) (Phase 2 + 5-prep) | Admin only |
| `/[locale]/admin/pieces/[id]/edit` | Edit piece + verification URL callout + gallery toggle + physical-characteristics section + danger zone hard-delete (Phase 2 + 4 + 5-prep) | Admin only |
| `/[locale]/admin/analytics` | Analytics (Phase 6) | Admin only |
| `/[locale]/admin/flags` | Fraud flags (Phase 6) | Admin only |
| `/[locale]/api/gallery` | Gallery pagination JSON (Phase 4) | Public |
| `POST /api/admin/pieces` | JSON insert; mirrors the form server action (Phase 2) | Admin only |
| `GET/PATCH /api/admin/pieces/[id]` | JSON fetch/update; locked-uid enforced (Phase 2) | Admin only |
| `DELETE /api/admin/pieces/[id]` | Hard-delete a piece + cascading cleanup (Phase 5-prep) | Admin only |
| `POST /api/admin/photos` | multipart upload to `piece-photos` bucket (Phase 2) | Admin only |
| `DELETE /api/admin/photos` | Remove a photo from a piece + bucket (Phase 2) | Admin only |
| `GET /api/admin/cards/[id]` | A6 PDF certificate, cached in `cards` bucket (Phase 3) | Admin only |
| `/sitemap.xml` | Sitemap covering landing + gallery + every published piece's /v/[uid] (Phase 4) | Public |
| `/robots.txt` | Robots policy; disallows /admin + /api; declares sitemap (Phase 4) | Public |
| `/[locale]/claim/coming-soon` | Placeholder for the Phase 5 claim flow | Public |
| `/[locale]/legal/mentions` | Mentions légales / legal notice (Phase 5-prep) | Public |
| `/[locale]/legal/privacy` | Privacy policy / GDPR disclosure (Phase 5-prep) | Public |
| `/[locale]/legal/terms` | Terms of use (Phase 5-prep) | Public |
| `POST /api/test/signin` | Test-only password signin, gated by `E2E_TEST_LOGIN_ENABLED=1` | Disabled in prod |

## Security operations

### HMAC secret rotation

When to rotate:

- On suspected compromise (env vars leaked, secret transited an
  insecure channel, accidentally pasted into chat / logs / a ticket)
- On scheduled annual policy
- When an admin/operator with knowledge of the secret leaves

**Procedure (4 steps):**

1. **Generate a new secret.** 32 random bytes, hex-encoded:

   ```bash
   openssl rand -hex 32
   # or, equivalently:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Update `HMAC_SECRET` in two places, in this order:**

   - **Vercel Dashboard** → Project → Settings → Environment Variables →
     `HMAC_SECRET` → edit → save. Apply to **Production + Preview +
     Development** so every environment uses the same value.
   - **`.env.local`** in your local checkout, so the Node scripts and
     `npm run dev` pick up the new secret.
   - **Do NOT touch Supabase `app.hmac_secret`.** The Postgres GUC is no
     longer used. `compute_piece_verification_token()` is deprecated;
     all token computation happens in Node via `lib/hmac.ts`. Hosted
     Supabase projects also reject `alter database postgres set ...`
     with permission denied (42501), so even attempting it fails.

3. **Run the rotation script:**

   ```bash
   npm run rotate-tokens -- --yes
   ```

   This recomputes `verification_token` for every row in `pieces` via
   `signToken(nfc_uid, piece_id)` under the new secret. Idempotent
   (deterministic) — re-running with the same secret writes the same
   value. Output lists each piece's `piece_number` + old/new token
   prefix transitions, plus a final post-check asserting zero
   `NULL`/empty tokens remain.

4. **Trigger a Vercel redeploy** so the running production process
   picks up the new env var. Push any commit to `dev` (and merge to
   `main` if it should ship), or use Vercel Dashboard → Deployments →
   `...` → "Redeploy" on the current production deployment.

**Impact:**

- All currently-programmed NFC chips in the field become invalid until
  their URL is re-written by the operator.
- Each chip's URL must be re-fetched from the admin panel (the new HMAC
  produces a different `?t=` token) and re-written via NFC Tools.
- If a chip in a customer's hands isn't re-written, scanning it will
  show the tamper page (correct, fail-closed behavior).
- Use the admin's `/[locale]/admin/pieces/[id]/edit` "Programmer la
  puce NFC" callout to read the current valid URL for re-writing.

**Validation after rotation:**

- Open any piece's verification URL from the admin "Write to NFC chip"
  callout → must show the verification page normally.
- Modify one character of the `?t=` token in the URL → must show the
  tamper page.
- Both behaviors together confirm the new secret is active end-to-end.

**Out of scope (intentionally):**

- Bulk re-write of physical NFC chips — manual operator task with NFC
  Tools and the admin "Write to NFC chip" callout.
- HMAC version bump / multi-secret support for graceful rotation — over-
  engineering for current scale. A rotation is a deliberate revocation
  event; the abrupt invalidation is the feature.
- Automated rotation schedule / reminders — the calendar lives outside
  this repo.

## Roadmap

### Phase 1 — Foundation
- Next.js 15 scaffold, Tailwind v4, TypeScript strict
- Supabase migrations + RLS policies
- `next-intl` trilingual setup with RTL middleware
- Minimal `/v/[uid]` page with HMAC verification + logging
- Admin gate (placeholder page)
- Playwright tests for valid token + tamper paths
- `CLAUDE.md`, `README.md`, `.env.example`

### Phase 2 — Admin piece registration
- `/admin/pieces` list view
- `/admin/pieces/new` form (NFC UID validation, photo upload, all metadata)
- Generate verification URL on save
- Edit existing pieces

### Phase 3 — Card PDF + verification page polish
- A6 print-ready PDF with QR code, signature, edition number
- Verification page hero carousel, provenance timeline, tamper page polish
- Print stylesheet

### Phase 4 — Public gallery
- `/[locale]/gallery` showcasing every published `show_in_gallery=true` piece
- `show_in_gallery` flag on `pieces` (default true) with composite index for the gallery query
- Admin "Show in gallery" toggle on the edit form + `Gallery: ON / Hidden` badge in the list
- License-status chip filters (Originals / Public domain / Commissions / Licensed / Other / All)
- Client-side debounced search by `character_name`; Esc clears
- Infinite scroll (24 per batch) via `/[locale]/api/gallery`; static `?page=N` for crawlers
- SEO: `sitemap.xml` (landing + gallery + every published piece in 3 locales) and `robots.txt`
- OG/Twitter meta on `/[locale]/gallery` (hero photo of most recent piece)
- Landing-page CTA linking to the gallery

### Phase 5-prep — Admin login (password)
- `/[locale]/login` — email + password sign-in with zod validation
- `/[locale]/admin` gate redirects unauthenticated → `/login`,
  authenticated non-admin → `/login?error=access_denied`
- Admin top-bar with "Connecté en tant que <email>" + logout link
- Test fixtures use distinctive `test-*-do-not-use` passwords; production
  admins are created via the Supabase dashboard
- `/api/test/signin` remains gated by `E2E_TEST_LOGIN_ENABLED` (off in prod)

### Phase 5-prep — Legal pages + global footer
- Three trilingual public pages under `/[locale]/legal/`:
  `mentions` (mentions légales / legal notice), `privacy`
  (GDPR-compliant privacy policy covering `verification_logs`), and
  `terms` (terms of use governed by Moroccan law).
- Content lives in `i18n/{en,fr,ar}.json` under `legal.*` as a
  `{ title, intro, sections: [{ title, paragraphs[] }] }` shape so the
  same `LegalPage` component renders all three with `.map()`. Each
  page hardcodes a `LAST_UPDATED` const at the top and formats it via
  `Intl.DateTimeFormat` for the active locale.
- A `// LEGAL: reviewed and adapted by Seàn McGannon; consult a
  lawyer before scaling to high-volume sales.` comment lives at the
  top of every legal page file so the operator-review boundary is
  impossible to miss.
- Contact email used across all three pages: `contact@nachi3d.com`.
- `components/ui/SiteFooter.tsx` is a server component carrying the
  three legal links + `© Nachi3D <year>`. Rendered on landing,
  gallery, verification happy-path, login, all admin pages, and the
  three legal pages themselves. Intentionally absent on tamper +
  not-found panels so error states stay minimal.
- Sitemap entries for the nine legal URLs (3 pages × 3 locales) ship
  with `changeFrequency: yearly` + low priority — they're disclosure,
  not marketing.
- No cookie banner: auth cookies are strictly necessary and exempt;
  no tracking, analytics or third-party cookies exist to consent to.

### Phase 5-prep — Physical characteristics fields
- Six new optional columns on `pieces`: `height_mm` / `base_width_mm` /
  `weight_g` (numeric, mm and g — no inch/oz conversion) and `material` /
  `scale` / `variant_label` (free text; app-layer max-length 80/40/60).
  All nullable, no default — existing pieces simply have no specs.
- Admin form `/admin/pieces/new` + `/admin/pieces/[id]/edit` exposes a
  "Caractéristiques physiques" section (3 number inputs step 0.1 + 3 text
  inputs); zod (`lib/validation/piece.ts`) coerces empty inputs to `NULL`
  and rejects negatives / over-length text.
- Public verification page renders a `verification-specs` block after
  the provenance timeline, with only the non-null rows visible. If zero
  specs are set, the section is omitted entirely (no empty header, no
  layout shift). `variant_label` also surfaces as a prominent badge next
  to the character name so collectors spot it without scrolling.
- Card PDF (`lib/pdf/card-generator.ts`) renders a compact 3-column spec
  grid on the back, after the existing SCULPT/PAINT/EDITION/PIECE block.
  Same conditional behaviour — no specs filled means the card matches
  the pre-Phase-5-prep design byte-for-byte.
- **Post-deploy step:** `npm run purge:cards` must be run after this
  ships so already-cached PDFs regenerate with the new layout. The
  invalidation hook in `updatePiece()` only clears cards whose row was
  re-saved; existing rows untouched by the migration would otherwise
  keep serving the old PDF from the `cards` bucket.

### Phase 5-prep — Hard-delete piece
- Danger zone on `/admin/pieces/[id]/edit` with typed-confirmation modal
- `deletePiece()` clears the cached PDF, the photos folder, then the
  `pieces` row (FK CASCADE drops `provenance_events` + `verification_logs`)
- `DELETE /api/admin/pieces/[id]` for programmatic + test access
- Intended for cleaning test fixtures and operator-driven removals.
  Owner-requested removals stay on `status='archived'` (see Hard-delete
  policy below)

### Phase 5 — Owner claim + transfer
- Magic-link claim flow via Resend + Supabase Auth
- `/me` owner dashboard
- Transfer flow (one-time tokens, recipient confirmation, revoke)

### Phase 6 — Analytics + fraud detection
- Admin analytics dashboard (counts, country heatmap, leaderboard)
- Multi-country fraud flagging (cron)
- Per-piece verification log view

### Later
- Webhook from nachi3d.com to auto-create draft pieces on sale
- Collector profiles (opt-in)
- API for nachi3d.com to embed verified-piece badges

## Admin Auth (Phase 5-prep)

The admin surface is gated by an email + password sign-in flow at
`/[locale]/login` backed by `supabase.auth.signInWithPassword`. The
session is cookie-based via `@supabase/ssr` — no localStorage, no
client-side token storage.

**Operational notes:**

- **Account creation** — production admin users are provisioned by
  hand in the Supabase dashboard (Auth → Users → Add user) with the
  email auto-confirmed. There is no public sign-up surface and there is
  no in-app account creation UI. Anyone with admin needs gets a row
  added by the operator.
- **`is_admin` is the source of truth** — the login flow authenticates
  any valid Supabase user, then checks `profiles.is_admin` server-side.
  Non-admin authenticated users are immediately signed out and bounced
  back to `/login?error=access_denied`. To grant or revoke admin access,
  toggle `profiles.is_admin` in the database (dashboard SQL editor).
- **Password reset** — there is no in-app forgot-password flow. Reset is
  done from the Supabase dashboard (Auth → Users → ⋯ → Send recovery
  email, or set a new password directly). Reasoning: with a tiny admin
  set, manual ops is safer than shipping a self-serve flow that has to
  defend against enumeration / abuse.
- **No magic links here** — magic-link auth ships in Phase 5 for the
  public claim/transfer flow and is intentionally distinct from admin
  sign-in.
- **Test fixtures** — `scripts/seed-remote.ts` creates `admin@nachi3d.test`
  and `collector@nachi3d.test` with distinctive passwords
  (`test-admin-password-do-not-use` / `test-collector-password-do-not-use`).
  The "do-not-use" suffix is deliberate: anyone scanning the file should
  immediately recognize them as fixtures. These accounts must NOT exist
  in the production Supabase project.
- **`/api/test/signin`** — kept for local fast-iteration (`npm run dev:signin`)
  and Playwright global setup. Gated by `E2E_TEST_LOGIN_ENABLED=1` —
  the route returns 404 when the flag is unset. This flag is NOT set in
  the production Vercel environment.

## Data safety

**Tests and production currently share one Supabase project**
(`dxxwtjtjrslhsljnkiik`). The `.env.local` URL + service-role key resolve
to the same hosted database that serves `verify.nachi3dlabs.com`. There
is no separate test project today; running e2e against `.env.local` hits
the live data. (See "Future hardening" at the bottom of this section.)

In May 2026 a real piece (`Erpon`) was lost when the seed script's prune
step deleted every `pieces` row whose UUID was not in a hard-coded seed
list. Two-layer protection prevents recurrence:

### Layer 1 — `ALLOW_DESTRUCTIVE_SEED` env guard

`scripts/seed-remote.ts` only runs the prune block when
`process.env.ALLOW_DESTRUCTIVE_SEED === "1"`. With the flag unset (the
default everywhere except Playwright), the prune is skipped entirely
and the script only upserts canonical fixtures additively.

- **Set ONLY in `playwright.config.ts`** (both `process.env` for the
  Playwright runner — global-setup runs before webServer — and inside
  `webServer.env` so the dev server inherits it).
- **NEVER set in `.env.local`** or any production environment.
- **NEVER set in CI** unless that CI job points at a dedicated test
  Supabase project (currently it doesn't).
- **NEVER run `npm run db:seed` interactively** without first
  re-reading this section. The script logs a loud warning either way,
  but the additive path is the safe default for a reason.

### Layer 2 — `is_fixture` column

`pieces.is_fixture boolean not null default false` (added in
`20260514000000_add_is_fixture_flag.sql`). The seed prune is scoped to
`is_fixture = true`, so even with `ALLOW_DESTRUCTIVE_SEED=1` set, only
rows explicitly marked as fixtures can be deleted.

- The flag is set ONLY by `seed-remote.ts` (service-role, server-side).
- No admin form, no public/admin API, no zod schema includes
  `is_fixture` — the field is silently stripped from any payload by
  zod's default `.strip()` behavior, and `lib/server/pieces.ts`
  only spreads validated fields. An e2e spec
  (`admin-pieces.spec.ts → "is_fixture in admin payload is silently
  stripped"`) asserts this.
- Real operator pieces default to `false` at insert time — they are
  structurally unreachable by the seed prune even if Layer 1 is
  defeated.

### Reserved `piece_number` ranges

- **1–8999** — real operator pieces. Untouchable by the seed.
- **9001–9003** — canonical seed fixtures (Test Subject, Hidden
  Subject, Licensed Subject). The seed upserts them with
  `is_fixture=true`.
- **9100–9899** — test-created throwaway pieces (admin-pieces.spec.ts).
  These rows carry `is_fixture=false` (admin API never sets the flag),
  so the seed prune does NOT touch them — tests must clean up after
  themselves via the `createdPieceIds` afterEach hook in that spec.

The number range is convention, not a constraint — there is no DB-level
check enforcing it. The actual safety guarantee is the `is_fixture`
column.

### Future hardening (Phase 6)

The cleanest long-term fix is a separate Supabase project for tests,
selected via `.env.test` and pointed at by `playwright.config.ts`.
Production data and test data would no longer coexist. Deferred today
because the operator's free-tier slots are already allocated; revisit
when the cost of a third project is justified or a paid plan is in
place.

## Hard-delete policy

The danger zone on `/admin/pieces/[id]/edit` performs an **irreversible**
hard delete: the row in `public.pieces`, both child tables
(`provenance_events`, `verification_logs`) via FK CASCADE, the cached
PDF in the `cards` bucket, and every object under the `<id>/` prefix in
`piece-photos`. There is no trash bin and no undo. The operator is
solely accountable.

**Use hard delete for:**
- Cleaning up test fixtures (placeholder UIDs, bad data, scratch pieces)
- Operator-driven removal of a piece that should never have been
  recorded (entered against the wrong figurine, duplicate, etc.)

**Do NOT use hard delete for owner-requested removals.** Use
`status='archived'` instead — it hides the piece from the list and the
gallery while preserving the provenance trail, the verification log,
and the original certificate. We may need that history for legal or
authenticity-dispute reasons later, and once a hard delete fires
nothing in the database remembers the piece existed.

If an NFC chip has been programmed for a piece, deleting the piece
makes that chip unverifiable forever (the new `verification_token` for
any future piece will not match). Reuse the chip by registering a new
piece with the same `nfc_uid` only after the original has been deleted.

## Supabase Notes

**Remote-only.** This project does NOT use a local Supabase Docker
stack. There is no `supabase start`, no local Postgres on
`127.0.0.1:54322`, no Studio on `:54323`. Every environment talks
to the hosted project `dxxwtjtjrslhsljnkiik` via the keys in
`.env.local` (URL + anon + service-role). If you find yourself running
`supabase start`, stop and re-read this section — that is not the
workflow here.

- Migrations: `supabase/migrations/<timestamp>_<name>.sql`. Apply to
  the remote with `npm run db:push` (wraps `supabase db push`) or via
  the Supabase dashboard SQL editor.
- Reset: `npm run db:reset` runs `supabase db reset --linked` — this is
  **destructive** and replays every migration against the remote
  database. Never run plain `supabase db reset` (no flag) — that
  targets a local stack we do not run.
- Linking: a fresh clone must be linked once with
  `npx supabase link --project-ref dxxwtjtjrslhsljnkiik` before
  `db push` / `db reset --linked` will work.
- Seed data: `supabase/seed.sql` is reference-only. Local-stack seeding
  is not supported; insert seed rows on the remote via the SQL editor
  or a one-off migration if you need them in dev.
- Service-role key: only used server-side (in `lib/supabase/admin.ts`),
  never exposed to the client. Used for verification log inserts that
  bypass RLS.

## E2E Testing

End-to-end tests use [Playwright](https://playwright.dev/) and live in `tests/e2e/`.

### Prerequisites

```bash
npm install
npx playwright install --with-deps
```

### Running E2E tests

```bash
npm run test:e2e
# or run a single file:
npx playwright test tests/e2e/verification.spec.ts
# or with UI mode for debugging:
npx playwright test --ui
```

Tests run against `npm run dev` by default (configured in
`playwright.config.ts`). For CI, the workflow runs `npm run build`
then `npm run start` and points Playwright at the production build.

### Writing tests

- Use `data-testid` attributes for stable selectors
- Existing testids: `verification-piece-number`, `verification-character-name`,
  `verification-tamper-banner`, `admin-gate`, `locale-switcher`
- Seed test data via the test runner's `globalSetup`, not via the
  admin panel — keeps tests independent

## Step Prompt Template

Every feature step follows this shape:

1. Read CLAUDE.md
2. Create branch `claude/phase-N-<name>` from `dev`
3. Implement the phase's tasks
4. Run `npm run verify` — fix any failures
5. Run `npm run test:e2e` — fix any failures
6. Commit in logical chunks per the commit convention
7. Push the branch
8. Report: commits, deviations, verify/test output, next action

After the user confirms the feature works and says "merge", Claude Code
merges into dev, pushes, and deletes both local and remote feature
branches per the Branch Hygiene Policy. Report the deletion in the
final message.
