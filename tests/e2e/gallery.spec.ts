import { test, expect } from "@playwright/test";
import { signToken } from "@/lib/hmac";
import { ADMIN_STATE_PATH } from "./fixtures/auth";
import { setFixtureGalleryVisibility } from "./fixtures/seed-control";

const SEED_PIECE_ID = "00000000-0000-0000-0000-000000000001";
const SEED_NFC_UID = "04A1B2C3D4E580";
const SEED_HIDDEN_PIECE_ID = "00000000-0000-0000-0000-000000000002";
const SEED_HIDDEN_NFC_UID = "04B1C2D3E4F580";
const SEED_LICENSED_PIECE_ID = "00000000-0000-0000-0000-000000000003";

// Canonical seed fixtures default to show_in_gallery=false so the
// production /gallery on verify.nachi3dlabs.com stays empty of test
// infrastructure. This spec needs #9001 + #9003 visible for the
// gallery-renders / license-filter / search / click assertions, so
// flip them on for the spec run and revert on teardown. #9002 stays
// false throughout — that is the "hidden seed piece" the spec asserts
// against.
test.describe("Phase 4 — public gallery", () => {
  test.beforeAll(async () => {
    if (!process.env.HMAC_SECRET) {
      throw new Error("HMAC_SECRET must be set in .env.local for gallery.spec.ts");
    }
    await setFixtureGalleryVisibility(
      [SEED_PIECE_ID, SEED_LICENSED_PIECE_ID],
      true,
    );
  });

  test.afterAll(async () => {
    await setFixtureGalleryVisibility(
      [SEED_PIECE_ID, SEED_LICENSED_PIECE_ID],
      false,
    );
  });

  test("gallery renders published pieces; hidden piece is absent", async ({
    page,
  }) => {
    await page.goto("/en/gallery");
    await expect(page.getByTestId("gallery-page")).toBeVisible();
    await expect(page.getByTestId("gallery-grid")).toBeVisible();

    // The seeded published, show_in_gallery=true pieces appear.
    const cards = page.getByTestId("gallery-card");
    await expect(cards.first()).toBeVisible();

    // The seeded piece #9001 is on the grid.
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9001" }),
    ).toBeVisible();

    // The hidden piece (#9002) is NOT in the grid.
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9002" }),
    ).toHaveCount(0);
  });

  test("hidden piece still verifies on /v/[uid]", async ({ page }) => {
    // Sanity check on the gating contract: show_in_gallery=false hides
    // the piece from /gallery but the verification page is independent —
    // it still resolves and shows full piece data.
    const token = signToken(SEED_HIDDEN_NFC_UID, SEED_HIDDEN_PIECE_ID);
    const response = await page.goto(
      `/en/v/${SEED_HIDDEN_NFC_UID}?t=${token}`,
    );
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("verification-piece-number")).toContainText(
      "#9002",
    );
  });

  test("license filter narrows the visible cards", async ({ page }) => {
    await page.goto("/en/gallery");

    // Both seeded show_in_gallery=true pieces visible initially.
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9001" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9003" }),
    ).toBeVisible();

    // Click the "licensed" chip — only #9003 (licensed) should remain.
    await page.getByTestId("gallery-filter-licensed").click();
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9003" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9001" }),
    ).toHaveCount(0);
  });

  test("search filters by character_name client-side", async ({ page }) => {
    await page.goto("/en/gallery");
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9001" }),
    ).toBeVisible();

    const input = page.getByTestId("gallery-search");
    await input.fill("Licensed");
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9003" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9001" }),
    ).toHaveCount(0);

    // Esc clears the search.
    await input.press("Escape");
    await expect(input).toHaveValue("");
  });

  test("search shows empty state when nothing matches", async ({ page }) => {
    await page.goto("/en/gallery");
    await page.getByTestId("gallery-search").fill("zzz-no-such-name");
    await expect(page.getByTestId("gallery-empty-filtered")).toBeVisible();
  });

  test("clicking a card navigates to /v/[uid] and renders the piece", async ({
    page,
  }) => {
    await page.goto("/en/gallery");
    await page
      .getByTestId("gallery-card")
      .filter({ hasText: "Test Subject" })
      .first()
      .click();
    await page.waitForURL(/\/en\/v\/[0-9A-F]+\?t=/);
    await expect(page.getByTestId("verification-piece-number")).toContainText(
      "#9001",
    );
  });

  test("OG meta on gallery page", async ({ request }) => {
    const res = await request.get("/en/gallery");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/property=["']og:title["']/);
    expect(html).toMatch(/property=["']og:description["']/);
    expect(html).toMatch(/property=["']og:type["'][^>]*content=["']website["']/);
    expect(html).toMatch(/name=["']twitter:card["']/);
  });

  test("/sitemap.xml contains the seeded piece verification URLs", async ({
    request,
  }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.startsWith("<?xml")).toBe(true);
    expect(body).toContain("<urlset");

    // Each of the three locales should have an entry for the seeded piece.
    for (const locale of ["en", "fr", "ar"]) {
      expect(body).toMatch(
        new RegExp(`/${locale}/v/${SEED_NFC_UID}\\?t=[0-9a-f]{24}`),
      );
    }

    // Landing + gallery in all locales.
    for (const locale of ["en", "fr", "ar"]) {
      expect(body).toContain(`/${locale}/gallery`);
    }
  });

  test("/robots.txt returns 200 with sitemap declared", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/Sitemap:\s*https?:\/\/\S+\/sitemap\.xml/);
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("/admin");
  });

  test("RTL: /ar/gallery sets dir=rtl on <html>", async ({ page }) => {
    await page.goto("/ar/gallery");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("gallery-page")).toBeVisible();
  });
});

test.describe("Phase 4 — admin gallery toggle", () => {
  test.use({ storageState: ADMIN_STATE_PATH });

  // Same gating as the public-gallery describe: the licensed seed
  // piece (#9003) defaults to show_in_gallery=false in production. The
  // toggle test asserts a flip-from-on-to-off-then-back round trip, so
  // we set it visible at the start and revert at the end.
  test.beforeAll(async () => {
    await setFixtureGalleryVisibility([SEED_LICENSED_PIECE_ID], true);
  });

  test.afterAll(async () => {
    await setFixtureGalleryVisibility([SEED_LICENSED_PIECE_ID], false);
  });

  test("toggling show_in_gallery=false hides the piece, then re-enabling restores it", async ({
    page,
    request,
  }) => {
    // Two full edit-form round trips with cold Next compilation on the
    // admin pieces route easily exceed the default 30 s budget on the
    // first run of a fresh dev server.
    test.setTimeout(90_000);
    // Start from a known state: the licensed piece is visible in /gallery.
    await page.goto("/en/gallery");
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9003" }),
    ).toBeVisible();

    // Flip to hidden via the edit form.
    await page.goto(`/en/admin/pieces/${SEED_LICENSED_PIECE_ID}/edit`);
    const toggle = page.getByTestId("field-show_in_gallery");
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.getByTestId("publish").click();
    // Server action against remote Supabase + revalidatePath routinely
    // takes 5+ seconds on the first dev-server compile of this route,
    // exceeding Playwright's default 5 s assertion budget.
    await expect(page.getByTestId("form-saved")).toBeVisible({ timeout: 15_000 });

    // Verify via the API that the row was persisted.
    const after = await request.get(
      `/api/admin/pieces/${SEED_LICENSED_PIECE_ID}`,
    );
    expect(after.status()).toBe(200);
    const body = (await after.json()) as { piece: { show_in_gallery: boolean } };
    expect(body.piece.show_in_gallery).toBe(false);

    // /gallery now omits #9003.
    await page.goto("/en/gallery");
    await expect(
      page.getByTestId("gallery-card-number").filter({ hasText: "#9003" }),
    ).toHaveCount(0);

    // Restore so subsequent runs of this spec start clean.
    await page.goto(`/en/admin/pieces/${SEED_LICENSED_PIECE_ID}/edit`);
    const toggle2 = page.getByTestId("field-show_in_gallery");
    await toggle2.check();
    await page.getByTestId("publish").click();
    await expect(page.getByTestId("form-saved")).toBeVisible({ timeout: 15_000 });
  });

  test("admin pieces list shows the gallery badge", async ({ page }) => {
    await page.goto("/en/admin/pieces");
    const badges = page.getByTestId("piece-gallery-badge");
    await expect(badges.first()).toBeVisible();

    // The hidden seed piece (piece_number 9002) may or may not be on
    // page 1 depending on how many extra pieces the admin-pieces.spec
    // run left behind, so navigate to its edit page directly to verify
    // the badge path renders both states.
    await page.goto(`/en/admin/pieces/${SEED_HIDDEN_PIECE_ID}/edit`);
    const toggle = page.getByTestId("field-show_in_gallery");
    await expect(toggle).not.toBeChecked();
  });
});

