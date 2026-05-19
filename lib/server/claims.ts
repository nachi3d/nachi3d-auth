import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClaimRow } from "@/lib/supabase/types";

export const CLAIM_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h, matches Supabase magic-link default

export class ClaimServerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ClaimServerError";
  }
}

export function newClaimToken(): string {
  // 32 bytes → 43-char base64url string, ~256 bits of entropy.
  return randomBytes(32).toString("base64url");
}

export async function findUnclaimedPublishedPiece(pieceId: string): Promise<{
  id: string;
  nfc_uid: string;
  character_name: string;
  piece_number: number;
  current_owner_id: string | null;
} | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("pieces")
    .select("id, nfc_uid, character_name, piece_number, current_owner_id, status")
    .eq("id", pieceId)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    nfc_uid: data.nfc_uid,
    character_name: data.character_name,
    piece_number: data.piece_number,
    current_owner_id: data.current_owner_id,
  };
}

export interface CreateClaimInput {
  piece_id: string;
  email: string;
  display_name: string;
  country: string;
}

export async function createClaim(input: CreateClaimInput): Promise<ClaimRow> {
  const sb = createAdminClient();
  const token = newClaimToken();
  const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_MS).toISOString();

  const { data, error } = await sb
    .from("claims")
    .insert({
      piece_id: input.piece_id,
      email: input.email,
      display_name: input.display_name,
      country: input.country,
      token,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error) {
    throw new ClaimServerError(500, "db_error", error.message);
  }
  return data as ClaimRow;
}

export async function getClaimByToken(token: string): Promise<ClaimRow | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("claims")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  return (data as ClaimRow | null) ?? null;
}

export type ClaimResult =
  | { ok: true; piece_id: string }
  | {
      ok: false;
      error:
        | "invalid_token"
        | "already_consumed"
        | "expired"
        | "piece_not_found"
        | "already_claimed"
        | "db_error";
    };

export async function claimPiece(args: {
  token: string;
  user_id: string;
  display_name: string;
  country: string;
}): Promise<ClaimResult> {
  const sb = createAdminClient();
  const { data, error } = await sb.rpc("claim_piece", {
    p_token: args.token,
    p_user_id: args.user_id,
    p_display_name: args.display_name,
    p_country: args.country,
  });
  if (error) {
    return { ok: false, error: "db_error" };
  }
  const result = data as ClaimResult;
  return result;
}
