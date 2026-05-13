import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const PIECE_PHOTOS_BUCKET = "piece-photos";
const CARDS_BUCKET = "cards";

/**
 * Remove every object under the <pieceId>/ prefix in the piece-photos
 * bucket. Idempotent: an empty folder (or a piece with zero uploads)
 * is treated as success.
 *
 * Returns the number of objects removed so callers can log what was
 * cleared. Throws only on transport errors, not on "nothing to do".
 */
export async function deletePiecePhotos(pieceId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data: entries, error: listErr } = await supabase.storage
    .from(PIECE_PHOTOS_BUCKET)
    .list(pieceId, { limit: 1000 });
  if (listErr) {
    throw new Error(
      `deletePiecePhotos(${pieceId}): list failed: ${listErr.message}`,
    );
  }
  if (!entries || entries.length === 0) return 0;

  const paths = entries.map((entry) => `${pieceId}/${entry.name}`);
  const { error: removeErr } = await supabase.storage
    .from(PIECE_PHOTOS_BUCKET)
    .remove(paths);
  if (removeErr) {
    throw new Error(
      `deletePiecePhotos(${pieceId}): remove failed: ${removeErr.message}`,
    );
  }
  return paths.length;
}

/**
 * Remove the cached PDF for this piece from the cards bucket.
 * Idempotent: a missing file is a no-op success. Storage's remove()
 * does not surface a 404 in a way we need to differentiate.
 */
export async function deletePieceCardPdf(pieceId: string): Promise<void> {
  const supabase = createAdminClient();
  const path = `${pieceId}.pdf`;
  // remove() is documented as idempotent and returns the list of paths
  // that were removed; absent paths are silently ignored.
  await supabase.storage.from(CARDS_BUCKET).remove([path]);
}
