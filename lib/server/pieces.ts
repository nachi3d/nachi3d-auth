import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { signToken } from "@/lib/hmac";
import {
  pieceSchema,
  piecePatchSchema,
  type PieceInput,
  type PiecePatch,
} from "@/lib/validation/piece";
import {
  deletePiecePhotos,
  deletePieceCardPdf,
} from "@/lib/storage/piece-assets";
import type { PieceRow } from "@/lib/supabase/types";

const PIECE_PHOTOS_BUCKET = "piece-photos";

export class PieceServerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "PieceServerError";
  }
}

function isUniqueViolation(err: { code?: string }): boolean {
  return err.code === "23505";
}

function constraintField(err: { message?: string }): string | null {
  if (!err.message) return null;
  if (err.message.includes("nfc_uid")) return "nfc_uid";
  if (err.message.includes("piece_number")) return "piece_number";
  return null;
}

export async function nextPieceNumber(): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pieces")
    .select("piece_number")
    .order("piece_number", { ascending: false })
    .limit(1);

  if (error) {
    throw new PieceServerError(500, "db_error", error.message);
  }
  const top = data?.[0]?.piece_number ?? 0;
  return top + 1;
}

export async function createPiece(rawInput: unknown): Promise<PieceRow> {
  const parsed = pieceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new PieceServerError(
      400,
      "validation_error",
      "Invalid piece input",
      parsed.error.flatten().fieldErrors,
    );
  }
  const input: PieceInput = parsed.data;

  const supabase = createAdminClient();

  const id = randomUUID();
  const verificationToken = signToken(input.nfc_uid, id);

  const { data: piece, error } = await supabase
    .from("pieces")
    .insert({
      id,
      piece_number: input.piece_number,
      edition_number: input.edition_number,
      edition_total: input.edition_total,
      nfc_uid: input.nfc_uid,
      verification_token: verificationToken,
      character_name: input.character_name,
      character_quote: input.character_quote,
      license_status: input.license_status,
      license_notes: input.license_notes,
      sculpt_date: input.sculpt_date,
      paint_date: input.paint_date,
      photos: input.photos,
      current_owner_id: null,
      status: input.status,
      show_in_gallery: input.show_in_gallery,
      height_mm: input.height_mm,
      base_width_mm: input.base_width_mm,
      weight_g: input.weight_g,
      material: input.material,
      scale: input.scale,
      variant_label: input.variant_label,
    })
    .select("*")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const field = constraintField(error) ?? "nfc_uid";
      throw new PieceServerError(
        409,
        "duplicate",
        `${field} already in use`,
        { [field]: [`${field} already in use`] },
      );
    }
    throw new PieceServerError(500, "db_error", error.message);
  }

  // Best-effort provenance audit. Failures here don't undo the piece insert
  // (Phase 5 will wrap both in an RPC for true atomicity).
  await supabase.from("provenance_events").insert({
    piece_id: id,
    event_type: "created",
    from_owner_id: null,
    to_owner_id: null,
    notes: null,
  });

  return piece as PieceRow;
}

export async function updatePiece(
  id: string,
  rawPatch: unknown,
): Promise<PieceRow> {
  const parsed = piecePatchSchema.safeParse(rawPatch);
  if (!parsed.success) {
    throw new PieceServerError(
      400,
      "validation_error",
      "Invalid piece patch",
      parsed.error.flatten().fieldErrors,
    );
  }
  const patch: PiecePatch = parsed.data;

  const supabase = createAdminClient();

  const { data: existing, error: existingErr } = await supabase
    .from("pieces")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingErr) {
    throw new PieceServerError(500, "db_error", existingErr.message);
  }
  if (!existing) {
    throw new PieceServerError(404, "not_found", "Piece not found");
  }

  // Locked-UID enforcement: once published, nfc_uid is immutable. The form
  // disables the input on the client; this is the server-side guarantee
  // that holds even if a caller hits the API directly.
  if (
    existing.status === "published" &&
    patch.nfc_uid !== undefined &&
    patch.nfc_uid !== existing.nfc_uid
  ) {
    throw new PieceServerError(
      409,
      "uid_locked",
      "nfc_uid cannot be changed once a piece is published",
      { nfc_uid: ["NFC UID is locked on published pieces"] },
    );
  }

  const nextUid = patch.nfc_uid ?? existing.nfc_uid;
  const tokenChanged = nextUid !== existing.nfc_uid;
  const update: Partial<PieceRow> = { ...patch };
  if (tokenChanged) {
    update.verification_token = signToken(nextUid, id);
  }

  const { data: updated, error } = await supabase
    .from("pieces")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const field = constraintField(error) ?? "nfc_uid";
      throw new PieceServerError(
        409,
        "duplicate",
        `${field} already in use`,
        { [field]: [`${field} already in use`] },
      );
    }
    throw new PieceServerError(500, "db_error", error.message);
  }

  // Invalidate the cached card PDF — any field change can affect the card,
  // and recomputing on first GET is cheap enough to not bother diffing.
  await invalidateCardCache(id);

  return updated as PieceRow;
}

const CARDS_BUCKET = "cards";

export function cardCachePath(pieceId: string): string {
  return `${pieceId}.pdf`;
}

/**
 * Invariant: any function that mutates a piece's card-rendered fields
 * MUST call invalidateCardCache(id) on success — otherwise the next
 * GET /api/admin/cards/[id] will serve a stale PDF from the bucket.
 *
 * Card-rendered fields (everything the certificate shows or signs):
 *   - piece_number       (front, large mono)
 *   - edition_number     (front, "n/total" inline)
 *   - edition_total      (front + back metadata)
 *   - nfc_uid            (signs the embedded QR; back metadata)
 *   - verification_token (recomputed, embedded in QR)
 *   - character_name     (front, serif)
 *   - character_quote    (front pull-quote)
 *   - sculpt_date        (back metadata)
 *   - paint_date         (back metadata)
 *   - photos             (Phase 4+ may render hero on the card)
 *
 * Today this invariant is upheld by updatePiece() (this module). Phase 5
 * background workflows — bulk imports, owner transfers, scheduled
 * republishes, anything that bypasses updatePiece() — MUST call this
 * helper themselves. If you find yourself writing to public.pieces and
 * not calling this, write a wrapper instead and route the new path
 * through it.
 *
 * Mutations to license_status / license_notes / current_owner_id /
 * status by themselves do NOT change the rendered card and don't need
 * invalidation; updatePiece still invalidates unconditionally because
 * the marginal cost is ~one storage delete per save.
 */
export async function invalidateCardCache(pieceId: string): Promise<void> {
  const supabase = createAdminClient();
  // Storage remove is idempotent — non-existent files yield an error which
  // we deliberately swallow because "nothing to invalidate" is a success.
  await supabase.storage.from(CARDS_BUCKET).remove([cardCachePath(pieceId)]);
}

export async function getCachedCardPdf(
  pieceId: string,
): Promise<Uint8Array | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(CARDS_BUCKET)
    .download(cardCachePath(pieceId));
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function putCardPdf(
  pieceId: string,
  bytes: Uint8Array,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(CARDS_BUCKET)
    .upload(cardCachePath(pieceId), bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) {
    throw new PieceServerError(500, "storage_error", error.message);
  }
}

export async function uploadPhoto(
  pieceId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  if (!file || typeof file === "string") {
    throw new PieceServerError(400, "validation_error", "No file uploaded");
  }
  if (file.size === 0) {
    throw new PieceServerError(400, "validation_error", "Empty file");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new PieceServerError(
      413,
      "too_large",
      "Photo exceeds 8 MB. Resize before upload.",
    );
  }
  if (!file.type.startsWith("image/")) {
    throw new PieceServerError(
      415,
      "unsupported_media",
      `Unsupported file type ${file.type}`,
    );
  }

  const supabase = createAdminClient();
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${pieceId}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(PIECE_PHOTOS_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new PieceServerError(500, "storage_error", error.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PIECE_PHOTOS_BUCKET).getPublicUrl(path);
  return { url: publicUrl, path };
}

export async function deletePhoto(
  pieceId: string,
  url: string,
): Promise<void> {
  const supabase = createAdminClient();
  const marker = `/${PIECE_PHOTOS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) {
    throw new PieceServerError(400, "validation_error", "Invalid photo URL");
  }
  const path = url.slice(idx + marker.length).split("?")[0] ?? "";
  if (!path.startsWith(`${pieceId}/`)) {
    throw new PieceServerError(
      403,
      "forbidden",
      "Photo path does not belong to this piece",
    );
  }

  const { error } = await supabase.storage
    .from(PIECE_PHOTOS_BUCKET)
    .remove([path]);
  if (error) {
    throw new PieceServerError(500, "storage_error", error.message);
  }
}

/**
 * Hard-delete a piece and every asset that hangs off it. Irreversible.
 *
 * Order of operations is deliberately storage → DB:
 *   1. cached PDF in the `cards` bucket
 *   2. every photo under the `<id>/` prefix in `piece-photos`
 *   3. row in `public.pieces` (the FKs on `provenance_events.piece_id`
 *      and `verification_logs.piece_id` are ON DELETE CASCADE — see
 *      20260503000000_initial_schema.sql — so the children disappear
 *      with the parent and we don't manually delete them)
 *
 * Storage cleanup runs first because storage failures are recoverable
 * (orphaned objects are easy to rm later) but a half-deleted DB row
 * with live storage is not. If the DB delete fails we still throw.
 *
 * Storage failures before the DB delete are logged but do NOT abort
 * the operation — operators have asked to delete the piece, and a
 * stuck PDF in the cards bucket should not block that.
 *
 * Returns the deleted piece's piece_number so the caller can show
 * "Piece #NNNN deleted" in the success banner without keeping a
 * separate read-before-delete around.
 */
export async function deletePiece(id: string): Promise<{
  deleted_piece_number: number;
}> {
  const supabase = createAdminClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("pieces")
    .select("id, piece_number")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    throw new PieceServerError(500, "db_error", fetchErr.message);
  }
  if (!existing) {
    throw new PieceServerError(404, "not_found", "Piece not found");
  }

  // Storage cleanup. Both helpers are idempotent and only throw on
  // transport errors; missing files are treated as success. We log
  // failures but continue so the DB row still gets deleted — leaving
  // the row alive while the photos/PDF are unreachable would be the
  // worse end state.
  try {
    await deletePieceCardPdf(id);
  } catch (e) {
    console.error(
      `deletePiece(${id}): card PDF cleanup failed (continuing):`,
      e instanceof Error ? e.message : e,
    );
  }
  try {
    await deletePiecePhotos(id);
  } catch (e) {
    console.error(
      `deletePiece(${id}): photos cleanup failed (continuing):`,
      e instanceof Error ? e.message : e,
    );
  }

  const { error: deleteErr } = await supabase
    .from("pieces")
    .delete()
    .eq("id", id);
  if (deleteErr) {
    throw new PieceServerError(500, "db_error", deleteErr.message);
  }

  return { deleted_piece_number: existing.piece_number };
}

export async function getPieceById(id: string): Promise<PieceRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pieces")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new PieceServerError(500, "db_error", error.message);
  }
  return (data as PieceRow | null) ?? null;
}

export interface ListPiecesOptions {
  page: number;
  pageSize: number;
  status: "draft" | "published" | "archived" | "all";
}

export async function listPieces(opts: ListPiecesOptions): Promise<{
  rows: PieceRow[];
  total: number;
}> {
  const supabase = createAdminClient();
  const from = (opts.page - 1) * opts.pageSize;
  const to = from + opts.pageSize - 1;

  let query = supabase
    .from("pieces")
    .select("*", { count: "exact" })
    .order("piece_number", { ascending: false })
    .range(from, to);

  if (opts.status !== "all") {
    query = query.eq("status", opts.status);
  }

  const { data, count, error } = await query;
  if (error) {
    throw new PieceServerError(500, "db_error", error.message);
  }
  return { rows: (data ?? []) as PieceRow[], total: count ?? 0 };
}
