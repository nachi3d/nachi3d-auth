import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PieceRow, TransferRow } from "@/lib/supabase/types";

export const TRANSFER_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class TransferServerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TransferServerError";
  }
}

export function newTransferToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function getPieceOwnedBy(
  pieceId: string,
  ownerId: string,
): Promise<PieceRow | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("pieces")
    .select("*")
    .eq("id", pieceId)
    .eq("current_owner_id", ownerId)
    .maybeSingle();
  return (data as PieceRow | null) ?? null;
}

export interface CreateTransferInput {
  piece_id: string;
  from_owner_id: string;
  to_email: string;
  note?: string;
}

export async function createTransfer(
  input: CreateTransferInput,
): Promise<TransferRow> {
  const sb = createAdminClient();
  const token = newTransferToken();
  const expiresAt = new Date(Date.now() + TRANSFER_TOKEN_TTL_MS).toISOString();

  const { data, error } = await sb
    .from("transfers")
    .insert({
      piece_id: input.piece_id,
      from_owner_id: input.from_owner_id,
      to_email: input.to_email,
      note: input.note ?? null,
      token,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error) {
    throw new TransferServerError(500, "db_error", error.message);
  }
  return data as TransferRow;
}

export async function getTransferByToken(
  token: string,
): Promise<TransferRow | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("transfers")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  return (data as TransferRow | null) ?? null;
}

export type AcceptTransferResult =
  | { ok: true; piece_id: string }
  | {
      ok: false;
      error:
        | "invalid_token"
        | "accepted"
        | "revoked"
        | "expired"
        | "email_mismatch"
        | "piece_not_found"
        | "ownership_changed"
        | "invalid_user"
        | "db_error";
    };

export async function acceptTransfer(args: {
  token: string;
  user_id: string;
}): Promise<AcceptTransferResult> {
  const sb = createAdminClient();
  const { data, error } = await sb.rpc("accept_transfer", {
    p_token: args.token,
    p_user_id: args.user_id,
  });
  if (error) {
    return { ok: false, error: "db_error" };
  }
  return data as AcceptTransferResult;
}

/**
 * Owner-initiated revoke. Verifies the requesting user is the
 * transfer's from_owner_id and that the transfer is still pending,
 * then flips status → 'revoked'. Returns true on success, false on
 * not-found / not-owner / not-pending.
 */
export async function revokeTransfer(args: {
  transfer_id: string;
  requester_id: string;
}): Promise<boolean> {
  const sb = createAdminClient();
  const { data: existing } = await sb
    .from("transfers")
    .select("id, from_owner_id, status")
    .eq("id", args.transfer_id)
    .maybeSingle();
  if (!existing) return false;
  if (existing.from_owner_id !== args.requester_id) return false;
  if (existing.status !== "pending") return false;

  const { error } = await sb
    .from("transfers")
    .update({ status: "revoked" })
    .eq("id", args.transfer_id)
    .eq("status", "pending"); // double-check under update
  return !error;
}

/**
 * Best-effort eager expiry — flips pending transfers past their
 * expires_at to status='expired'. Called from /me page loads so the
 * UI never shows stale "pending" rows even when pg_cron isn't running
 * (free-tier Supabase requires it to be enabled in the dashboard).
 */
export async function expirePendingTransfers(): Promise<number> {
  const sb = createAdminClient();
  const { data, error } = await sb.rpc("expire_pending_transfers_and_claims");
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

export interface TransferWithPiece extends TransferRow {
  piece: Pick<
    PieceRow,
    "id" | "piece_number" | "character_name" | "nfc_uid" | "photos"
  > | null;
}

export async function listTransfersForOwner(
  ownerId: string,
): Promise<TransferWithPiece[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("transfers")
    .select("*")
    .or(`from_owner_id.eq.${ownerId},to_owner_id.eq.${ownerId}`)
    .order("created_at", { ascending: false });
  if (error) {
    throw new TransferServerError(500, "db_error", error.message);
  }
  const rows = (data ?? []) as TransferRow[];
  if (rows.length === 0) return [];

  const pieceIds = Array.from(new Set(rows.map((r) => r.piece_id)));
  const { data: piecesData } = await sb
    .from("pieces")
    .select("id, piece_number, character_name, nfc_uid, photos")
    .in("id", pieceIds);
  const piecesById = new Map(
    (piecesData ?? []).map((p) => [p.id, p as TransferWithPiece["piece"]]),
  );
  return rows.map((r) => ({ ...r, piece: piecesById.get(r.piece_id) ?? null }));
}
