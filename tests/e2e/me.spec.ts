import { test, expect } from "@playwright/test";
import { COLLECTOR_STATE_PATH } from "./fixtures/auth";
import {
  SEED_COLLECTOR_ID,
  SEED_PIECE_ID,
} from "../../scripts/seed-remote";
import {
  deleteProvenanceByType,
  deleteTransfersForPiece,
  setPieceOwner,
} from "./fixtures/phase5";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

test.describe("Phase 5 — /me dashboard", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: COLLECTOR_STATE_PATH });

  test.beforeEach(async () => {
    await deleteTransfersForPiece(SEED_PIECE_ID);
    await deleteProvenanceByType(SEED_PIECE_ID, ["claimed", "transferred"]);
    await setPieceOwner(SEED_PIECE_ID, SEED_COLLECTOR_ID);
  });

  test.afterEach(async () => {
    await deleteTransfersForPiece(SEED_PIECE_ID);
    await deleteProvenanceByType(SEED_PIECE_ID, ["claimed", "transferred"]);
    await setPieceOwner(SEED_PIECE_ID, null);
  });

  test("unauthenticated /me redirects to /login", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      const page = await ctx.newPage();
      await page.goto("/en/me");
      await page.waitForURL(/\/en\/login(\?.*)?$/);
    } finally {
      await ctx.close();
    }
  });

  test("signed-in collector sees owned piece in the grid", async ({ page }) => {
    await page.goto("/en/me");
    await expect(page.getByTestId("me-dashboard")).toBeVisible();
    const owned = page.getByTestId("me-owned-item");
    await expect(owned).toHaveCount(1);
    await expect(owned.first()).toHaveAttribute(
      "data-piece-id",
      SEED_PIECE_ID,
    );
    // History is empty (no transfers yet).
    await expect(page.getByTestId("me-history-empty")).toBeVisible();
  });

  test("profile edit persists display_name + country", async ({ page }) => {
    await page.goto("/en/me");
    await page.getByTestId("me-profile-display-name").fill("Phase 5 Collector");
    await page.getByTestId("me-profile-country").fill("MA");
    await Promise.all([
      page.waitForURL(/\/en\/me\?profile_saved=1/),
      page.getByTestId("me-profile-save").click(),
    ]);
    await expect(page.getByTestId("me-banner")).toHaveAttribute(
      "data-banner-code",
      "profile_saved",
    );
    // Refresh, check the values stuck.
    await page.goto("/en/me");
    await expect(page.getByTestId("me-profile-display-name")).toHaveValue(
      "Phase 5 Collector",
    );
    await expect(page.getByTestId("me-profile-country")).toHaveValue("MA");

    // Revert to the seed profile so other specs aren't surprised.
    const sb = admin();
    await sb
      .from("profiles")
      .update({ display_name: "Test Collector", country: null })
      .eq("id", SEED_COLLECTOR_ID);
  });
});
