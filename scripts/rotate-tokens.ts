#!/usr/bin/env tsx
/**
 * Rotate every piece's stored verification_token using the CURRENT
 * HMAC_SECRET loaded from .env.local. Recomputes via lib/hmac.signToken()
 * — no Postgres involvement.
 *
 * Run this after HMAC_SECRET has been rotated in Vercel + .env.local. The
 * runtime never trusts the stored token (it always recomputes from
 * HMAC_SECRET + nfc_uid + piece_id), so technically the stored value
 * only matters when an admin surface or script reads it back to print
 * the current URL. Keeping it in sync still prevents confusion.
 *
 *   npm run rotate-tokens          (interactive, asks Y to proceed)
 *   npm run rotate-tokens -- --yes (non-interactive, e.g. ops automation)
 *
 * Idempotent: signToken is deterministic, so re-running with the same
 * secret writes the same value. Project-ref interlock refuses to run if
 * NEXT_PUBLIC_SUPABASE_URL and the service-role JWT disagree about the
 * project — same defence as seed-remote.ts.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { signToken } from "../lib/hmac";

const WARNING = [
  "WARNING: This will invalidate all currently-circulating verification URLs.",
  "Any NFC chip programmed before this rotation will need its URL re-written",
  "by the operator. Continue? Press Y to proceed.",
].join("\n");

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

async function confirm(): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question("> ");
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

async function rotateTokens(opts: { yes: boolean }): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "rotate-tokens: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "must be set in .env.local",
    );
  }
  if (!process.env.HMAC_SECRET) {
    throw new Error(
      "rotate-tokens: HMAC_SECRET must be set in .env.local. This script " +
        "rewrites every stored token with signToken() under the current " +
        "secret — refusing to run without one.",
    );
  }

  const urlRef = projectRefFromUrl(url);
  const keyRef = decodeJwtRef(serviceKey);
  if (!urlRef || !keyRef || urlRef !== keyRef) {
    throw new Error(
      `rotate-tokens: project-ref mismatch (url=${urlRef ?? "?"}, ` +
        `service_role=${keyRef ?? "?"}). Refusing to rotate — check .env.local.`,
    );
  }

  console.log(`rotate-tokens: target project ref = ${urlRef}`);
  console.log(WARNING);
  if (!opts.yes) {
    const ok = await confirm();
    if (!ok) {
      console.log("rotate-tokens: aborted by user.");
      return;
    }
  } else {
    console.log("rotate-tokens: --yes flag set, skipping confirmation.");
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: pieces, error: selectErr } = await sb
    .from("pieces")
    .select("id, nfc_uid, piece_number, verification_token")
    .order("piece_number", { ascending: true });
  if (selectErr) {
    throw new Error(
      `rotate-tokens: failed to read pieces: ${selectErr.message}`,
    );
  }
  if (!pieces || pieces.length === 0) {
    console.log("rotate-tokens: pieces table is empty — nothing to rotate.");
    return;
  }

  console.log(`rotate-tokens: rotating ${pieces.length} piece(s)...`);
  for (const p of pieces) {
    const oldPrefix = p.verification_token
      ? String(p.verification_token).slice(0, 8)
      : "(empty)";
    const newToken = signToken(p.nfc_uid as string, p.id as string);
    const newPrefix = newToken.slice(0, 8);
    const num = String(p.piece_number).padStart(4, "0");
    console.log(`  piece #${num}  ${oldPrefix} -> ${newPrefix}`);

    const { error: updateErr } = await sb
      .from("pieces")
      .update({ verification_token: newToken })
      .eq("id", p.id as string);
    if (updateErr) {
      throw new Error(
        `rotate-tokens: failed to update piece ${p.id}: ${updateErr.message}`,
      );
    }
  }

  const { count: nullCount, error: nullErr } = await sb
    .from("pieces")
    .select("id", { count: "exact", head: true })
    .is("verification_token", null);
  if (nullErr) {
    throw new Error(
      `rotate-tokens: post-check (NULL) failed: ${nullErr.message}`,
    );
  }
  const { count: emptyCount, error: emptyErr } = await sb
    .from("pieces")
    .select("id", { count: "exact", head: true })
    .eq("verification_token", "");
  if (emptyErr) {
    throw new Error(
      `rotate-tokens: post-check (empty) failed: ${emptyErr.message}`,
    );
  }
  const bad = (nullCount ?? 0) + (emptyCount ?? 0);
  if (bad > 0) {
    throw new Error(
      `rotate-tokens: post-check found ${bad} piece(s) with NULL or empty ` +
        "verification_token after rotation — aborting.",
    );
  }

  console.log(
    `rotate-tokens: ok — ${pieces.length} piece(s) rotated, 0 NULL/empty tokens.`,
  );
}

const isCli =
  !!process.argv[1] && /[\\/]rotate-tokens\.ts$/.test(process.argv[1]);
if (isCli) {
  const yes = process.argv.includes("--yes");
  rotateTokens({ yes })
    .then(() => undefined)
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
