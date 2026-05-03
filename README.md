# Nachi3D Certify

Authentication registry and public verification page for **Nachi3D** resin
figurines. Each piece ships with an embedded NTAG215 NFC chip and a printed
certificate card; both link to a per-piece verification URL on
`verify.nachi3d.com`.

This repo is the web app that serves those URLs, gates the admin tools,
and stores the canonical record of every piece I produce.

## Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript strict) |
| Backend | Supabase (Postgres + Auth + Storage) |
| Styling | Tailwind CSS v4 |
| i18n | `next-intl` (FR / EN / AR + RTL) |
| Deployment | Cloudflare Pages |
| Testing | Playwright (E2E) |
| Email (Phase 4) | Resend |
| PDF (Phase 3) | `pdf-lib` |

## Quickstart

```bash
# 1. Install deps
npm install
npx playwright install --with-deps

# 2. Copy env template and fill in values
cp .env.example .env.local
#    NEXT_PUBLIC_SITE_URL
#    NEXT_PUBLIC_SUPABASE_URL
#    NEXT_PUBLIC_SUPABASE_ANON_KEY
#    SUPABASE_SERVICE_ROLE_KEY
#    HMAC_SECRET   <-- generate: openssl rand -hex 32

# 3. Apply migrations to your Supabase project
npm run db:migrate
# Or for fully-local stack:
#   npx supabase start
#   npm run db:reset    # drops, re-applies migrations + seed.sql

# 4. Dev
npm run dev
# open http://localhost:3000/en

# 5. Verify (lint + typecheck + build)
npm run verify

# 6. End-to-end tests
npm run test:e2e
```

## Routes (Phase 1)

| Path | Purpose |
|---|---|
| `/[locale]` | Landing page introducing Nachi3D Certify |
| `/[locale]/v/[uid]` | Public verification page (HMAC-validated) |
| `/[locale]/admin` | Admin gate (placeholder until Phase 2) |

`[locale]` ∈ `{en, fr, ar}`. `ar` renders RTL.

## Data model

See `supabase/migrations/20260503000000_initial_schema.sql` for the
authoritative schema. Tables:

- `profiles` — extends `auth.users` with `display_name`, `country`, `is_admin`
- `pieces` — one row per figurine
- `provenance_events` — append-only history per piece
- `verification_logs` — append-only tap log

Row-level security is on for all four tables. Public reads are gated by
`pieces.status = 'published'`. Verification log inserts are performed
server-side via the service-role key (which bypasses RLS by design).

## NFC verification flow

The chip stores a URL of the form

```
https://verify.nachi3d.com/v/<nfc_uid>?t=<token>
```

where `token = HMAC-SHA256(HMAC_SECRET, "<nfc_uid>:<piece_id>")`,
truncated to 24 hex characters.

On request to `/v/[uid]`:

1. Look up the piece by `nfc_uid` (`status = 'published'` only).
2. Recompute the expected token. Constant-time compare against the URL `t` param.
3. Valid → render the piece, log the tap.
4. Invalid token, UID exists → render the **tamper** page.
5. UID not found → render the **not-found** page.

The HMAC secret never leaves the server. Tokens are short enough to keep
QR codes dense, long enough (96 bits) to make casual forgery infeasible.

## Testing

Two Playwright specs in `tests/e2e/verification.spec.ts`:

- `valid token renders the seeded piece` — happy path (200 + `#0001`)
- `invalid token renders the tamper page` — tamper-evident fallback

Both rely on the seeded piece in `supabase/seed.sql` (UID
`04A1B2C3D4E580`, piece id `00000000-0000-0000-0000-000000000001`)
and the `HMAC_SECRET` env var.

```bash
npm run test:e2e
# or single-file with debug UI:
npx playwright test tests/e2e/verification.spec.ts --ui
```

Tests auto-start the dev server. Set `PLAYWRIGHT_BASE_URL=https://...`
to run them against a deployed preview instead.

## Environment variables

| Name | Where | Why |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | client + server | Used in NFC URL generation, OG tags |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | RLS-protected anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Used for verification log inserts |
| `HMAC_SECRET` | **server only** | Secret for token signing |

`.env.local` is gitignored. Never check secrets in. Rotating
`HMAC_SECRET` invalidates every existing chip URL.

## Production deployment checklist

**Required on Cloudflare Pages (production):** all five vars from the
table above — `NEXT_PUBLIC_SITE_URL` (set to `https://verify.nachi3d.com`,
no trailing slash), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `HMAC_SECRET`. The two `NEXT_PUBLIC_*`
values are exposed to the browser by design (RLS protects the data); the
service role key and HMAC secret are server-only and must be stored as
encrypted Cloudflare Pages environment variables, never in
`wrangler.toml`, never echoed in build logs. Rotating `HMAC_SECRET`
invalidates every chip already programmed in the field — only do it as
part of a deliberate revocation event. Also set
`app.hmac_secret = '<HMAC_SECRET>'` on the production Postgres database
(via `alter database postgres set app.hmac_secret = '...'` in the
Supabase SQL editor) so the `compute_piece_verification_token()` function
produces stored tokens that match what the runtime computes.

**Must NOT be set in production:** `E2E_TEST_LOGIN_ENABLED`. This flag
(set automatically by `playwright.config.ts` on the dev server it
spawns) opens `POST /api/test/signin`, an endpoint that signs in any
user given an email and password and writes a Supabase session cookie
to the response. It is the bypass we need so Playwright can avoid
magic-link round-trips, but in production it would let anyone with a
known password mint a session for that account, defeating the
magic-link-only auth posture. The route returns 404 unless the flag
is set to exactly `1`, but the safest posture is to never set it on
the prod environment at all — confirm it is unset on Cloudflare Pages
before each promotion of `dev` → `main`.

## Card PDF fonts

The four typefaces used by the certificate-card PDF generator
(Inter, Cormorant Garamond, JetBrains Mono, Noto Sans Arabic) are
checked in under `public/fonts/`. All are SIL Open Font License 1.1
— embedding into documents is permitted. The matching `OFL-*.txt`
license texts ship next to the TTFs as required by the licence.

Fresh clones and CI builds produce real-typography PDFs without any
extra step. To bump a version after upstream fixes, delete the file
and run:

```bash
npm run fetch:fonts        # idempotent; redownloads any missing font
```

The script pulls from `github.com/google/fonts` and rejects the
build if a URL 404s — never substitute a non-OFL family.

## Roadmap

- **Phase 1** *(this release)* — Foundation: schema, RLS, HMAC, verification page, admin gate, i18n, Playwright.
- **Phase 2** — Admin piece registration form (NFC UID validation, photo upload).
- **Phase 3** — Card PDF generator (`pdf-lib`) + verification page polish.
- **Phase 4** — Owner claim + transfer flow (Resend magic links).
- **Phase 5** — Analytics + multi-country fraud detection.

See `CLAUDE.md` for the contribution workflow, branch hygiene, and
release process.
