#!/usr/bin/env tsx
/**
 * Seed the REMOTE Supabase project with the fixtures Playwright depends on:
 *   - admin@nachi3d.test     (is_admin = true)
 *   - collector@nachi3d.test (is_admin = false)
 *   - three published fixture pieces (#9001 / #9002 / #9003), all
 *     marked is_fixture = true
 *   - one provenance event for the canonical seed piece
 *
 * Why this exists: supabase/seed.sql does raw INSERTs into auth.users +
 * auth.identities, which the local Supabase stack permits but `supabase
 * db push` against a hosted project does not. Under the remote-only
 * policy this script is the supported way to seed test data.
 *
 *   npm run db:seed
 *
 * Idempotent: re-runs upsert/update existing rows without error. Safe to
 * call from tests/e2e/global-setup.ts.
 *
 * ⚠️ DATA SAFETY
 *
 * Tests and production currently share one Supabase project (see
 * "Data safety" in CLAUDE.md). Two-layer protection keeps real operator
 * pieces alive:
 *
 *   1. ALLOW_DESTRUCTIVE_SEED env guard — the prune block is SKIPPED
 *      unless this is set to exactly "1". An accidental run (CI, a
 *      developer typing `npm run db:seed`, a stray import) leaves all
 *      data alone and only upserts the fixtures additively.
 *
 *   2. is_fixture column scoping — even with the env guard set, the
 *      prune deletes only rows where is_fixture = true. Real pieces
 *      default to is_fixture = false at creation, and no admin form,
 *      API, or zod schema exposes the column. The seed script (this
 *      file) is the only place that flips it true. So a real piece is
 *      structurally unreachable by the prune even if the env guard
 *      were defeated.
 *
 * Defaults: ONLY playwright.config.ts sets ALLOW_DESTRUCTIVE_SEED=1.
 * NEVER set it in .env.local or any production environment.
 *
 * Refuses to run unless NEXT_PUBLIC_SUPABASE_URL points at a *.supabase.co
 * host AND the loaded service-role JWT references the same project ref —
 * a defensive interlock so the script never seeds the wrong database.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { createClient } from "@supabase/supabase-js";
import { signToken } from "../lib/hmac";

export const SEED_ADMIN_ID = "00000000-0000-0000-0000-000000000010";
export const SEED_COLLECTOR_ID = "00000000-0000-0000-0000-000000000020";
export const SEED_PIECE_ID = "00000000-0000-0000-0000-000000000001";
export const SEED_NFC_UID = "04A1B2C3D4E580";

// Phase 4 gallery fixture: a published piece that is intentionally
// hidden from the gallery (show_in_gallery=false) so the e2e suite
// can assert it appears on /v/[uid] but never in /gallery.
export const SEED_HIDDEN_PIECE_ID = "00000000-0000-0000-0000-000000000002";
export const SEED_HIDDEN_NFC_UID = "04B1C2D3E4F580";

// Phase 4 gallery fixture: a published piece with a non-original
// license, used to assert the license-status filter on /gallery.
export const SEED_LICENSED_PIECE_ID =
  "00000000-0000-0000-0000-000000000003";
export const SEED_LICENSED_NFC_UID = "04C1D2E3F4A580";

// Distinctive test-only passwords. The "do-not-use" suffix makes it
// obvious to anyone scanning this file (or grepping the repo) that
// these credentials are fixtures, never production secrets. Production
// admins are created via the Supabase dashboard with operator-chosen
// passwords; these values must NOT appear in the production project.
export const SEED_ADMIN_PASSWORD = "test-admin-password-do-not-use";
export const SEED_COLLECTOR_PASSWORD = "test-collector-password-do-not-use";

const SEED_USERS = [
  {
    id: SEED_ADMIN_ID,
    email: "admin@nachi3d.test",
    password: SEED_ADMIN_PASSWORD,
    display_name: "Test Admin",
    is_admin: true,
  },
  {
    id: SEED_COLLECTOR_ID,
    email: "collector@nachi3d.test",
    password: SEED_COLLECTOR_PASSWORD,
    display_name: "Test Collector",
    is_admin: false,
  },
] as const;

function decodeJwtRef(jwt: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1] ?? "", "base64").toString("utf8"),
    );
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

function projectRefFromUrl(url: string): string | null {
  const match = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}

export async function seedRemote(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "seed-remote: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "must be set in .env.local",
    );
  }
  if (!process.env.HMAC_SECRET) {
    throw new Error(
      "seed-remote: HMAC_SECRET must be set so the seeded piece's " +
        "verification_token matches what the runtime computes.",
    );
  }

  const urlRef = projectRefFromUrl(url);
  const keyRef = decodeJwtRef(serviceKey);
  if (!urlRef || !keyRef || urlRef !== keyRef) {
    throw new Error(
      `seed-remote: project-ref mismatch (url=${urlRef ?? "?"}, ` +
        `service_role=${keyRef ?? "?"}). Refusing to seed — check .env.local.`,
    );
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---------------------------------------------------------------
  // Destructive prune — gated behind two independent layers.
  // ---------------------------------------------------------------
  //
  // Layer 1 (env guard): ALLOW_DESTRUCTIVE_SEED must be exactly "1".
  // Tests opt in via playwright.config.ts; everything else (a developer
  // typing `npm run db:seed`, a stray import in CI, an accidental
  // re-run) leaves the database alone and only upserts fixtures
  // additively below.
  //
  // Layer 2 (semantic scope): even when the env guard passes, the
  // delete is restricted to is_fixture = true. Real operator pieces
  // default to is_fixture = false and no admin form, API, or zod schema
  // exposes the column — so the prune cannot reach them no matter what
  // an attacker or buggy caller does to bypass layer 1.
  //
  // verification_logs and provenance_events for the deleted rows
  // cascade via FK on_delete=cascade in the schema.
  const SEED_PIECE_IDS = [
    SEED_PIECE_ID,
    SEED_HIDDEN_PIECE_ID,
    SEED_LICENSED_PIECE_ID,
  ];
  if (process.env.ALLOW_DESTRUCTIVE_SEED === "1") {
    const { error: pruneErr } = await sb
      .from("pieces")
      .delete()
      .eq("is_fixture", true)
      .not("id", "in", `(${SEED_PIECE_IDS.map((id) => `"${id}"`).join(",")})`);
    if (pruneErr) {
      throw new Error(
        `seed-remote: failed to prune non-canonical fixture pieces: ${pruneErr.message}`,
      );
    }
    console.log(
      "[seed-remote] ALLOW_DESTRUCTIVE_SEED=1 — pruned non-canonical " +
        "is_fixture=true rows (real pieces untouched).",
    );
  } else {
    console.warn(
      "[seed-remote] ALLOW_DESTRUCTIVE_SEED is not set — skipping prune. " +
        "Fixtures will be upserted additively. Real pieces are untouched.",
    );
  }

  for (const user of SEED_USERS) {
    const { data: existing } = await sb.auth.admin.getUserById(user.id);
    if (existing?.user) {
      // Reset the password to the canonical test value in case it drifted.
      const { error: updateErr } = await sb.auth.admin.updateUserById(user.id, {
        password: user.password,
        email_confirm: true,
      });
      if (updateErr) {
        throw new Error(
          `seed-remote: failed to update ${user.email}: ${updateErr.message}`,
        );
      }
    } else {
      const { error: createErr } = await sb.auth.admin.createUser({
        id: user.id,
        email: user.email,
        password: user.password,
        email_confirm: true,
      });
      if (createErr) {
        throw new Error(
          `seed-remote: failed to create ${user.email}: ${createErr.message}`,
        );
      }
    }

    // The on_auth_user_created trigger inserts a profiles row. Make sure
    // display_name and is_admin reflect the seed contract.
    const { error: profileErr } = await sb
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: user.display_name,
          is_admin: user.is_admin,
        },
        { onConflict: "id" },
      );
    if (profileErr) {
      throw new Error(
        `seed-remote: failed to upsert profile for ${user.email}: ${profileErr.message}`,
      );
    }
  }

  // Fixtures use the reserved piece_number range >= 9000 to keep them
  // visually distinct from real operator pieces (1–8999) in the admin
  // list, and so that future operator pieces can never collide with the
  // fixture row numbers.
  const seededPieces = [
    {
      id: SEED_PIECE_ID,
      piece_number: 9001,
      edition_number: 1,
      edition_total: 10,
      nfc_uid: SEED_NFC_UID,
      character_name: "Test Subject",
      character_quote: "Authenticity is what you carry, not what you claim.",
      license_status: "original" as const,
      license_notes: null as string | null,
      show_in_gallery: true,
    },
    // Gallery-hidden but still published — exercises the /gallery
    // filter without breaking /v/[uid].
    {
      id: SEED_HIDDEN_PIECE_ID,
      piece_number: 9002,
      edition_number: 1,
      edition_total: 1,
      nfc_uid: SEED_HIDDEN_NFC_UID,
      character_name: "Hidden Subject",
      character_quote: null,
      license_status: "original" as const,
      license_notes: null as string | null,
      show_in_gallery: false,
    },
    // Different license_status so the gallery license-filter test has
    // something to assert against.
    {
      id: SEED_LICENSED_PIECE_ID,
      piece_number: 9003,
      edition_number: 1,
      edition_total: 5,
      nfc_uid: SEED_LICENSED_NFC_UID,
      character_name: "Licensed Subject",
      character_quote: null,
      license_status: "licensed" as const,
      license_notes: "Licensed for the test fixture.",
      show_in_gallery: true,
    },
  ];

  for (const p of seededPieces) {
    const verificationToken = signToken(p.nfc_uid, p.id);
    const { error: pieceErr } = await sb.from("pieces").upsert(
      {
        id: p.id,
        piece_number: p.piece_number,
        edition_number: p.edition_number,
        edition_total: p.edition_total,
        nfc_uid: p.nfc_uid,
        verification_token: verificationToken,
        character_name: p.character_name,
        character_quote: p.character_quote,
        license_status: p.license_status,
        license_notes: p.license_notes,
        sculpt_date: "2026-04-01",
        paint_date: "2026-04-15",
        photos: [],
        current_owner_id: null,
        status: "published",
        show_in_gallery: p.show_in_gallery,
        // Mark every seeded row as a fixture so the layer-2 prune
        // scope can find it. Real operator pieces never carry this
        // flag (default false at the DB level).
        is_fixture: true,
      },
      { onConflict: "id" },
    );
    if (pieceErr) {
      throw new Error(
        `seed-remote: failed to upsert piece ${p.id}: ${pieceErr.message}`,
      );
    }

    // Invalidate any cached certificate PDF for this piece. The
    // upsert may have changed card-rendered fields (piece_number,
    // character_name, etc.) and the cards bucket caches by piece-id;
    // serving a stale PDF after a fixture bump made cards.spec.ts
    // assert against the wrong piece number. Storage remove is
    // idempotent — a missing object errors, which we deliberately
    // swallow because "nothing cached" is a success state.
    await sb.storage.from("cards").remove([`${p.id}.pdf`]);
  }

  // provenance_events has no natural unique key for "created" — only
  // insert one if there's no row for this piece yet, so re-runs don't pile up.
  const { count } = await sb
    .from("provenance_events")
    .select("id", { count: "exact", head: true })
    .eq("piece_id", SEED_PIECE_ID);
  if ((count ?? 0) === 0) {
    const { error: provErr } = await sb.from("provenance_events").insert({
      piece_id: SEED_PIECE_ID,
      event_type: "created",
      notes: "Initial registration (seed data).",
    });
    if (provErr) {
      throw new Error(
        `seed-remote: failed to insert provenance event: ${provErr.message}`,
      );
    }
  }
}

// CLI entry guard: only run the side-effecting block when this file is the
// entrypoint of the process. Avoid `import.meta.url` here — Playwright's
// transpile path treats this module as CJS and `import.meta` is invalid in
// that scope.
const isCli =
  !!process.argv[1] && /[\\/]seed-remote\.ts$/.test(process.argv[1]);
if (isCli) {
  seedRemote()
    .then(() => {
      console.log("seed-remote: ok");
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
