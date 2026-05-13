import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { signToken } from "@/lib/hmac";
import type { LicenseStatus, PieceRow } from "@/lib/supabase/types";
import { LICENSE_STATUSES } from "@/lib/validation/piece";

export type GalleryLicenseFilter = LicenseStatus | "all";

export const GALLERY_PAGE_SIZE = 24;

// Server-side projection used by the gallery and its sitemap entries.
// We don't need the heavy fields (verification_token, license_notes,
// provenance) for cards, so keep this slim. The signed token is
// computed on the fly from nfc_uid + id and shipped per card so a
// click on the card resolves on /v/[uid]?t=<token> without an extra
// roundtrip.
export type GalleryCard = {
  id: string;
  piece_number: number;
  nfc_uid: string;
  character_name: string;
  license_status: LicenseStatus;
  hero: string | null;
  token: string;
};

export interface GalleryQueryOptions {
  page: number;
  pageSize?: number;
  license: GalleryLicenseFilter;
}

export interface GalleryQueryResult {
  cards: GalleryCard[];
  total: number;
  hasMore: boolean;
}

function isLicenseFilter(value: string | undefined): value is GalleryLicenseFilter {
  if (!value) return false;
  if (value === "all") return true;
  return (LICENSE_STATUSES as ReadonlyArray<string>).includes(value);
}

export function parseLicenseFilter(value: string | undefined): GalleryLicenseFilter {
  return isLicenseFilter(value) ? value : "all";
}

type GallerySelect = Pick<
  PieceRow,
  | "id"
  | "piece_number"
  | "nfc_uid"
  | "character_name"
  | "license_status"
  | "photos"
>;

function rowToCard(row: GallerySelect): GalleryCard {
  return {
    id: row.id,
    piece_number: row.piece_number,
    nfc_uid: row.nfc_uid,
    character_name: row.character_name,
    license_status: row.license_status,
    hero: row.photos[0] ?? null,
    token: signToken(row.nfc_uid, row.id),
  };
}

export async function listGalleryCards(
  opts: GalleryQueryOptions,
): Promise<GalleryQueryResult> {
  const pageSize = opts.pageSize ?? GALLERY_PAGE_SIZE;
  const from = (opts.page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = createAdminClient();
  let query = supabase
    .from("pieces")
    .select(
      "id, piece_number, nfc_uid, character_name, license_status, photos",
      { count: "exact" },
    )
    .eq("status", "published")
    .eq("show_in_gallery", true)
    .order("piece_number", { ascending: false })
    .range(from, to);

  if (opts.license !== "all") {
    query = query.eq("license_status", opts.license);
  }

  const { data, count, error } = await query;
  if (error) {
    throw new Error(`listGalleryCards: ${error.message}`);
  }

  const total = count ?? 0;
  const cards = (data ?? []).map((row) => rowToCard(row as GallerySelect));
  const hasMore = from + cards.length < total;
  return { cards, total, hasMore };
}

export interface GalleryStats {
  authenticated: number;
  claimed: number;
}

export async function getGalleryStats(): Promise<GalleryStats> {
  const supabase = createAdminClient();

  const [{ count: total }, { count: owned }] = await Promise.all([
    supabase
      .from("pieces")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("show_in_gallery", true),
    supabase
      .from("pieces")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("show_in_gallery", true)
      .not("current_owner_id", "is", null),
  ]);

  return {
    authenticated: total ?? 0,
    claimed: owned ?? 0,
  };
}

/**
 * All published pieces (including hidden-from-gallery) — used by the
 * sitemap, which should expose every verification URL regardless of
 * whether the piece participates in /gallery.
 */
export async function listAllPublishedForSitemap(): Promise<
  Array<{ nfc_uid: string; id: string; piece_number: number }>
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("pieces")
    .select("id, nfc_uid, piece_number")
    .eq("status", "published")
    .order("piece_number", { ascending: false });
  if (error) {
    throw new Error(`listAllPublishedForSitemap: ${error.message}`);
  }
  return (data ?? []) as Array<{ nfc_uid: string; id: string; piece_number: number }>;
}

/**
 * Hero photo of the most recent published piece — used as the gallery
 * OG image. Returns null if no published pieces have a photo.
 */
export async function getGalleryHeroPhoto(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("pieces")
    .select("photos")
    .eq("status", "published")
    .eq("show_in_gallery", true)
    .order("piece_number", { ascending: false })
    .limit(20);
  if (!data) return null;
  for (const row of data) {
    const hero = (row as { photos: string[] }).photos?.[0];
    if (hero) return hero;
  }
  return null;
}
