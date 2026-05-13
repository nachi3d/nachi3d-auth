#!/usr/bin/env tsx
/**
 * Wipe every cached certificate-card PDF from the REMOTE Supabase
 * `cards` bucket. Use this after any change to PDF content (domain in
 * the trilingual notice, copy, layout, fonts) — `invalidateCardCache()`
 * only runs on per-piece updates, so PDFs generated before the change
 * stay stale until either the underlying piece is edited or this
 * script is run.
 *
 *   npm run purge:cards
 *
 * Idempotent: re-runs against an empty bucket are a no-op.
 *
 * Refuses to run unless NEXT_PUBLIC_SUPABASE_URL points at a *.supabase.co
 * host AND the loaded service-role JWT references the same project ref —
 * the same defensive interlock seed-remote.ts uses, so the script never
 * deletes from the wrong project.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { createClient } from "@supabase/supabase-js";

const BUCKET = "cards";
// Supabase Storage `.list()` caps page size at 1000.
const PAGE_SIZE = 1000;

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

export async function purgeCardCache(): Promise<{ deleted: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "purge-card-cache: NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
    );
  }

  const urlRef = projectRefFromUrl(url);
  const keyRef = decodeJwtRef(serviceKey);
  if (!urlRef || !keyRef || urlRef !== keyRef) {
    throw new Error(
      `purge-card-cache: project-ref mismatch (url=${urlRef ?? "?"}, ` +
        `service_role=${keyRef ?? "?"}). Refusing to purge — check .env.local.`,
    );
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let totalDeleted = 0;
  // The bucket layout is flat: every cached PDF lives at `<pieceId>.pdf`
  // at the root. Page through the listing so a >1000-object bucket still
  // drains in one run; each iteration re-lists from offset 0 because the
  // previous page's objects have been deleted by the time we re-list.
  while (true) {
    const { data: entries, error: listErr } = await sb.storage
      .from(BUCKET)
      .list("", {
        limit: PAGE_SIZE,
        sortBy: { column: "name", order: "asc" },
      });
    if (listErr) {
      throw new Error(
        `purge-card-cache: failed to list ${BUCKET}: ${listErr.message}`,
      );
    }

    const paths = (entries ?? [])
      .map((e) => e.name)
      .filter((name) => !!name);
    if (paths.length === 0) break;

    const { data: removed, error: removeErr } = await sb.storage
      .from(BUCKET)
      .remove(paths);
    if (removeErr) {
      throw new Error(
        `purge-card-cache: failed to remove batch: ${removeErr.message}`,
      );
    }

    const removedNames = new Set((removed ?? []).map((r) => r.name));
    for (const name of paths) {
      const ok = removedNames.size === 0 || removedNames.has(name);
      console.log(`${ok ? "deleted" : "missed "} ${BUCKET}/${name}`);
      if (ok) totalDeleted++;
    }

    // If the page was short, there's nothing left to fetch.
    if (paths.length < PAGE_SIZE) break;
  }

  console.log(`purge-card-cache: ok (${totalDeleted} object(s) removed)`);
  return { deleted: totalDeleted };
}

const isCli =
  !!process.argv[1] && /[\\/]purge-card-cache\.ts$/.test(process.argv[1]);
if (isCli) {
  purgeCardCache().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
