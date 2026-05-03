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
4. Verify against a Cloudflare Pages preview deployment from the `dev` branch
5. Only THEN bump version and merge `dev` → `main`

**Why:** Cloudflare Pages preview builds run on the same Workers runtime
as production. Local dev uses Node which can mask edge-runtime
incompatibilities (e.g. Node-only APIs in middleware, missing polyfills).
Test on the preview deploy before promoting to main.

Main branch must always be deployable. If a broken build reaches `main`,
revert immediately with `git reset --hard` to the last known working tag.

### Dev Preview Deployment

Cloudflare Pages auto-deploys every push to `dev` to a preview URL
(typically `dev.nachi3d-auth.pages.dev` or similar). Before requesting
a merge to `main`, verify the preview URL renders correctly:

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
4. Cloudflare Pages auto-deploys `main` to `verify.nachi3d.com`
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
- **Auth** — Supabase Auth via `@supabase/ssr`. Magic links only (no
  password flow). Admin gate via `profiles.is_admin` flag.
- **Storage** — Supabase Storage bucket `piece-photos` for figurine
  images. Public read, admin-only write.
- **HMAC** — `HMAC-SHA256(HMAC_SECRET, "<nfc_uid>:<piece_id>")`
  (colon-separated payload, exactly the format in `lib/hmac.ts`),
  truncated to the first 24 hex chars. Constant-time compare on
  verification, after a format check rejects malformed candidates.
  Generate URLs with `npm run sign -- <nfc_uid> <piece_id>`, which
  imports the same `signToken()` helper as the runtime — never
  reimplement the HMAC outside `lib/hmac.ts`.
- **Cloudflare headers** — verification logs read `CF-IPCountry` and
  `CF-IPCity` for geo. Available only when deployed; locally they're
  null and that's fine.
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
                    current_owner_id, status, created_at, updated_at

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
| Admin gate | `/admin` while not logged in | Redirects to login |
| Admin gate | `/admin` while logged in but `is_admin=false` | 403 page |
| Locale routing | `/fr/v/<uid>?t=<token>` | French strings, LTR |
| Locale routing | `/ar/v/<uid>?t=<token>` | Arabic strings, RTL direction |
| NFC UID uniqueness | Insert duplicate UID | DB rejects with constraint error |
| Piece number uniqueness | Insert duplicate piece number | DB rejects with constraint error |

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

## Routes & Surfaces

| Route | Purpose | Auth |
|---|---|---|
| `/[locale]` | Landing page (Nachi3D Certify intro) | Public |
| `/[locale]/v/[uid]` | Public verification page | Public |
| `/[locale]/me` | Owner dashboard (Phase 4) | Logged in |
| `/[locale]/admin` | Admin home | Admin only |
| `/[locale]/admin/pieces` | List pieces (Phase 2) | Admin only |
| `/[locale]/admin/pieces/new` | Register piece (Phase 2) | Admin only |
| `/[locale]/admin/pieces/[id]/edit` | Edit piece (Phase 2) | Admin only |
| `/[locale]/admin/analytics` | Analytics (Phase 5) | Admin only |
| `/[locale]/admin/flags` | Fraud flags (Phase 5) | Admin only |

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

### Phase 4 — Owner claim + transfer
- Magic-link claim flow via Resend + Supabase Auth
- `/me` owner dashboard
- Transfer flow (one-time tokens, recipient confirmation, revoke)

### Phase 5 — Analytics + fraud detection
- Admin analytics dashboard (counts, country heatmap, leaderboard)
- Multi-country fraud flagging (cron)
- Per-piece verification log view

### Later
- Webhook from nachi3d.com to auto-create draft pieces on sale
- Public gallery (`/gallery`)
- Collector profiles (opt-in)
- API for nachi3d.com to embed verified-piece badges

## Supabase Notes

- Migrations: `supabase/migrations/<timestamp>_<name>.sql`. Apply with
  `npx supabase db push` or via the Supabase dashboard SQL editor.
- Local dev: `npx supabase start` spins up a local Postgres + Auth
  emulator for offline work. Seed via `supabase/seed.sql`.
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
