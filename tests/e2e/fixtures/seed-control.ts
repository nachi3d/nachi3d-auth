import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for the e2e test process. Used by spec
 * beforeAll / afterAll hooks to flip the canonical seed fixtures'
 * show_in_gallery on/off for the duration of a spec that asserts
 * against the public /gallery surface.
 *
 * Why this exists: the seed fixtures are show_in_gallery=false by
 * default so the production /gallery on verify.nachi3dlabs.com never
 * surfaces test infrastructure. Specs that need the fixtures visible
 * (gallery.spec.ts, navigation.spec.ts) opt in for the duration of
 * the spec and revert when done.
 *
 * Reads env directly — global-setup has already loaded .env.local
 * via dotenv before any spec runs.
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "seed-control: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Set show_in_gallery on a set of piece ids. Throws on Supabase error
 * so the failure surfaces at the spec's beforeAll, not as a confusing
 * later assertion failure.
 */
export async function setFixtureGalleryVisibility(
  pieceIds: string[],
  visible: boolean,
): Promise<void> {
  const sb = adminClient();
  const { error } = await sb
    .from("pieces")
    .update({ show_in_gallery: visible })
    .in("id", pieceIds);
  if (error) {
    throw new Error(
      `seed-control: failed to set show_in_gallery=${visible} on ${pieceIds.join(", ")}: ${error.message}`,
    );
  }
}
