import { test, expect } from "@playwright/test";
import { signToken } from "@/lib/hmac";
import { ADMIN_STATE_PATH } from "./fixtures/auth";
import { setFixtureGalleryVisibility } from "./fixtures/seed-control";

const SEED_PIECE_ID = "00000000-0000-0000-0000-000000000001";
const SEED_NFC_UID = "04A1B2C3D4E580";

// The "gallery card carries from=gallery" round-trip needs the
// canonical seed piece (#9001) to actually appear on /gallery. Seed
// fixtures default to show_in_gallery=false (production gallery must
// stay empty of test data), so flip it visible for this spec only.
test.describe("Phase 5-prep — navigation aids", () => {
  test.beforeAll(async () => {
    if (!process.env.HMAC_SECRET) {
      throw new Error(
        "HMAC_SECRET must be set in .env.local for navigation.spec.ts",
      );
    }
    await setFixtureGalleryVisibility([SEED_PIECE_ID], true);
  });

  test.afterAll(async () => {
    await setFixtureGalleryVisibility([SEED_PIECE_ID], false);
  });

  test.describe("public surfaces", () => {
    test("gallery: breadcrumb renders with Home + Gallery", async ({ page }) => {
      await page.goto("/en/gallery");
      const crumb = page.getByTestId("breadcrumb");
      await expect(crumb).toBeVisible();
      await expect(page.getByTestId("breadcrumb-segment-0")).toHaveText("Home");
      await expect(page.getByTestId("breadcrumb-segment-1")).toHaveText(
        "Gallery",
      );
      // First segment is a link, last segment is the current page (span).
      await expect(page.getByTestId("breadcrumb-segment-0")).toHaveAttribute(
        "href",
        "/en",
      );
      const lastTag = await page
        .getByTestId("breadcrumb-segment-1")
        .evaluate((el) => el.tagName);
      expect(lastTag).toBe("SPAN");
    });

    test("gallery: clicking the Home segment navigates to /en", async ({
      page,
    }) => {
      await page.goto("/en/gallery");
      await page.getByTestId("breadcrumb-segment-0").click();
      await page.waitForURL(/\/en\/?$/);
    });

    test("verification page: back link only when ?from=gallery is present", async ({
      page,
    }) => {
      const token = signToken(SEED_NFC_UID, SEED_PIECE_ID);

      // No from param → no back link.
      await page.goto(`/en/v/${SEED_NFC_UID}?t=${token}`);
      await expect(page.getByTestId("verification-piece-number")).toBeVisible();
      await expect(page.getByTestId("back-link")).toHaveCount(0);

      // With from=gallery → back link visible, links to /en/gallery.
      await page.goto(`/en/v/${SEED_NFC_UID}?t=${token}&from=gallery`);
      await expect(page.getByTestId("back-link")).toBeVisible();
      await expect(page.getByTestId("back-link")).toHaveAttribute(
        "href",
        "/en/gallery",
      );
    });

    test("gallery card carries from=gallery and back link works end-to-end", async ({
      page,
    }) => {
      await page.goto("/en/gallery");

      const card = page
        .getByTestId("gallery-card")
        .filter({ hasText: "Test Subject" })
        .first();
      const href = await card.locator("a").first().getAttribute("href");
      expect(href).toContain("from=gallery");

      await card.click();
      await page.waitForURL(/\/en\/v\/.+from=gallery/);

      const backLink = page.getByTestId("back-link");
      await expect(backLink).toBeVisible();
      await backLink.click();
      await page.waitForURL(/\/en\/gallery$/);
      await expect(page.getByTestId("gallery-page")).toBeVisible();
    });

    test("tamper page has no back link", async ({ page }) => {
      await page.goto(
        `/en/v/${SEED_NFC_UID}?t=invalidtoken000000000000&from=gallery`,
      );
      await expect(page.getByTestId("verification-tamper-banner")).toBeVisible();
      await expect(page.getByTestId("back-link")).toHaveCount(0);
    });

    test("not-found page has no back link", async ({ page }) => {
      await page.goto(
        "/en/v/DEADBEEFCAFE00?t=00000000000000000000000a&from=gallery",
      );
      await expect(page.getByTestId("verification-not-found")).toBeVisible();
      await expect(page.getByTestId("back-link")).toHaveCount(0);
    });

    test("claim/coming-soon: back link to home", async ({ page }) => {
      await page.goto("/en/claim/coming-soon");
      const back = page.getByTestId("back-link");
      await expect(back).toBeVisible();
      await expect(back).toHaveAttribute("href", "/en");
    });

    test("RTL: /ar/gallery breadcrumb uses the RTL-direction separator", async ({
      page,
    }) => {
      await page.goto("/ar/gallery");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.getByTestId("breadcrumb")).toBeVisible();
      // RTL build uses ‹ as the separator (LTR uses ›); verifies the
      // chevron actually flipped under dir=rtl.
      const sep = page.getByTestId("breadcrumb-separator").first();
      await expect(sep).toHaveText("‹");
    });
  });

  test.describe("admin surfaces", () => {
    test.use({ storageState: ADMIN_STATE_PATH });

    test("/admin: breadcrumb Home → Administration", async ({ page }) => {
      await page.goto("/en/admin");
      await expect(page.getByTestId("breadcrumb")).toBeVisible();
      await expect(page.getByTestId("breadcrumb-segment-0")).toHaveText("Home");
      await expect(page.getByTestId("breadcrumb-segment-1")).toHaveText(
        "Administration",
      );
    });

    test("/admin/pieces: breadcrumb Administration → Pieces", async ({
      page,
    }) => {
      await page.goto("/en/admin/pieces");
      await expect(page.getByTestId("breadcrumb")).toBeVisible();
      await expect(page.getByTestId("breadcrumb-segment-0")).toHaveText(
        "Administration",
      );
      await expect(page.getByTestId("breadcrumb-segment-1")).toHaveText(
        "Pieces",
      );

      // Click Administration segment → /en/admin
      await page.getByTestId("breadcrumb-segment-0").click();
      await page.waitForURL(/\/en\/admin\/?$/);
    });

    test("/admin/pieces/new: full breadcrumb chain", async ({ page }) => {
      await page.goto("/en/admin/pieces/new");
      await expect(page.getByTestId("breadcrumb")).toBeVisible();
      await expect(page.getByTestId("breadcrumb-segment-0")).toHaveText(
        "Administration",
      );
      await expect(page.getByTestId("breadcrumb-segment-1")).toHaveText(
        "Pieces",
      );
      await expect(page.getByTestId("breadcrumb-segment-2")).toHaveText(
        "New piece",
      );
    });

    test("/admin/pieces/[id]/edit: last segment shows piece number", async ({
      page,
    }) => {
      await page.goto(`/en/admin/pieces/${SEED_PIECE_ID}/edit`);
      await expect(page.getByTestId("breadcrumb")).toBeVisible();
      await expect(page.getByTestId("breadcrumb-segment-2")).toContainText(
        "#9001",
      );
    });
  });
});
