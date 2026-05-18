import { createClient } from "@supabase/supabase-js";

/**
 * Phase 5 e2e helpers — service-role manipulation of pieces, claims
 * and transfers for the claim/transfer/me specs.
 *
 * The shared Supabase project means every helper has to be scope-safe:
 * pieces touched here are the canonical fixtures (#9001 / #9002 /
 * #9003), all carrying is_fixture=true, so the data-safety policy in
 * CLAUDE.md applies.
 *
 * Claims and transfers inserted by these tests are tagged is_fixture
 * = true so the same prune contract that protects pieces protects
 * them. Tests must afterEach-clean the rows they create — the
 * helpers below provide bulk delete by piece_id for that purpose.
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "phase5: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function setPieceOwner(
  pieceId: string,
  ownerId: string | null,
): Promise<void> {
  const sb = adminClient();
  const { error } = await sb
    .from("pieces")
    .update({ current_owner_id: ownerId })
    .eq("id", pieceId);
  if (error) throw new Error(`setPieceOwner: ${error.message}`);
}

export async function deleteClaimsForPiece(pieceId: string): Promise<void> {
  const sb = adminClient();
  await sb.from("claims").delete().eq("piece_id", pieceId);
}

export async function deleteTransfersForPiece(pieceId: string): Promise<void> {
  const sb = adminClient();
  await sb.from("transfers").delete().eq("piece_id", pieceId);
}

/**
 * Wipe all provenance_events of a given type for a piece. Used to keep
 * the seeded "created" event alive while removing any "claimed" /
 * "transferred" rows the test added.
 */
export async function deleteProvenanceByType(
  pieceId: string,
  types: ReadonlyArray<"claimed" | "transferred" | "note">,
): Promise<void> {
  const sb = adminClient();
  await sb
    .from("provenance_events")
    .delete()
    .eq("piece_id", pieceId)
    .in("event_type", types);
}

export interface ClaimRow {
  id: string;
  token: string;
  consumed_at: string | null;
  expires_at: string;
  email: string;
}

export async function getClaimByPieceAndEmail(
  pieceId: string,
  email: string,
): Promise<ClaimRow | null> {
  const sb = adminClient();
  const { data } = await sb
    .from("claims")
    .select("id, token, consumed_at, expires_at, email")
    .eq("piece_id", pieceId)
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ClaimRow | null) ?? null;
}

export async function insertExpiredClaim(args: {
  piece_id: string;
  email: string;
}): Promise<{ id: string; token: string }> {
  const sb = adminClient();
  const token = `expired-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const expiredAt = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await sb
    .from("claims")
    .insert({
      piece_id: args.piece_id,
      email: args.email.toLowerCase(),
      display_name: "Expired Tester",
      country: "FR",
      token,
      expires_at: expiredAt,
      is_fixture: true,
    })
    .select("id, token")
    .single();
  if (error) throw new Error(`insertExpiredClaim: ${error.message}`);
  return data as { id: string; token: string };
}

export interface TransferRow {
  id: string;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  to_email: string;
  from_owner_id: string;
}

export async function getTransfersForPiece(
  pieceId: string,
): Promise<TransferRow[]> {
  const sb = adminClient();
  const { data } = await sb
    .from("transfers")
    .select("id, token, status, expires_at, to_email, from_owner_id")
    .eq("piece_id", pieceId)
    .order("created_at", { ascending: false });
  return (data ?? []) as TransferRow[];
}

export async function markTransferFixture(transferId: string): Promise<void> {
  const sb = adminClient();
  await sb
    .from("transfers")
    .update({ is_fixture: true })
    .eq("id", transferId);
}

export async function markClaimFixture(claimId: string): Promise<void> {
  const sb = adminClient();
  await sb.from("claims").update({ is_fixture: true }).eq("id", claimId);
}

export async function forceTransferExpired(transferId: string): Promise<void> {
  const sb = adminClient();
  const pastDate = new Date(Date.now() - 60_000).toISOString();
  await sb
    .from("transfers")
    .update({ expires_at: pastDate })
    .eq("id", transferId);
}

export async function callExpireRpc(): Promise<number> {
  const sb = adminClient();
  const { data } = await sb.rpc("expire_pending_transfers_and_claims");
  return typeof data === "number" ? data : 0;
}
