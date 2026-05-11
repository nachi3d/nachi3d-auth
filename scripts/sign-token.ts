#!/usr/bin/env tsx
/**
 * Sign an NFC verification URL using the runtime HMAC helper.
 *
 *   npm run sign -- <nfc_uid> <piece_id>
 *
 * Reads HMAC_SECRET (and NEXT_PUBLIC_SITE_URL, if set) from .env.local
 * or .env. Falls back to http://localhost:3000 for the site URL when
 * unset, so this is safe to run in dev without configuring the prod URL.
 *
 * NEVER reimplement the HMAC here — always go through signToken() so
 * the CLI and the runtime can never drift apart.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { signToken } from "../lib/hmac";

const [, , nfcUid, pieceId] = process.argv;

if (!nfcUid || !pieceId) {
  console.error(
    "Usage: npm run sign -- <nfc_uid> <piece_id>\n" +
      "       (both arguments are required; piece_id is the pieces.id UUID)",
  );
  process.exit(1);
}

if (!process.env.HMAC_SECRET) {
  console.error(
    "HMAC_SECRET is not set. Add it to .env.local or export it before running.",
  );
  process.exit(1);
}

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

const token = signToken(nfcUid, pieceId);
console.log(`${siteUrl}/v/${nfcUid}?t=${token}`);
