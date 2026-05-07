import { test, expect } from "@playwright/test";
import { signToken } from "@/lib/hmac";

// Must match supabase/seed.sql
const TEST_PIECE_ID = "00000000-0000-0000-0000-000000000001";
const TEST_NFC_UID = "04A1B2C3D4E580";
const SEEDED_CHARACTER_NAME = "Test Subject";
const SEEDED_QUOTE = "Authenticity is what you carry, not what you claim.";

test.describe("Verification page", () => {
  test.beforeAll(() => {
    if (!process.env.HMAC_SECRET) {
      throw new Error(
        "HMAC_SECRET must be set (in .env.local or the test environment) " +
          "for verification.spec.ts to compute valid tokens.",
      );
    }
  });

  test("valid token renders all verification sections", async ({ page }) => {
    const token = signToken(TEST_NFC_UID, TEST_PIECE_ID);
    const response = await page.goto(`/en/v/${TEST_NFC_UID}?t=${token}`);

    expect(response?.status()).toBe(200);
    await expect(
      page.getByTestId("verification-piece-number"),
    ).toContainText("#0001");
    await expect(
      page.getByTestId("verification-character-name"),
    ).toContainText(SEEDED_CHARACTER_NAME);
    await expect(page.getByTestId("authenticated-seal")).toBeVisible();
    await expect(page.getByTestId("character-quote")).toContainText(
      SEEDED_QUOTE,
    );
    await expect(page.getByTestId("hero-carousel")).toBeVisible();
    await expect(page.getByTestId("piece-meta")).toBeVisible();
    await expect(page.getByTestId("provenance-timeline")).toBeVisible();
    await expect(page.getByTestId("verification-edition")).toContainText(
      "1/10",
    );
    // Seeded piece has no current_owner_id, so the claim CTA renders.
    await expect(page.getByTestId("claim-cta")).toBeVisible();
  });

  test("OG and Twitter meta tags are populated for a verified piece", async ({
    request,
  }) => {
    const token = signToken(TEST_NFC_UID, TEST_PIECE_ID);
    const res = await request.get(`/en/v/${TEST_NFC_UID}?t=${token}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).toContain('property="og:title"');
    expect(html).toMatch(/property="og:title"\s+content="[^"]*#0001[^"]*"/);
    expect(html).toMatch(
      /property="og:title"\s+content="[^"]*Test Subject[^"]*"/,
    );
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:type"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('property="og:site_name"');
  });

  test("invalid token renders the tamper page and leaks no piece data", async ({
    page,
    request,
  }) => {
    await page.goto(`/en/v/${TEST_NFC_UID}?t=invalidtoken000000000000`);

    await expect(
      page.getByTestId("verification-tamper-banner"),
    ).toBeVisible();
    await expect(page.getByTestId("tamper-support-cta")).toBeVisible();
    await expect(page.getByTestId("verification-piece-number")).toHaveCount(0);
    await expect(page.getByTestId("verification-character-name")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("character-quote")).toHaveCount(0);

    // Re-fetch raw HTML and assert no piece data leaks. Catches the case
    // where a future refactor accidentally renders something into a
    // template that bypasses the testid-gated React tree.
    const res = await request.get(
      `/en/v/${TEST_NFC_UID}?t=invalidtoken000000000000`,
    );
    const html = await res.text();
    expect(html).not.toContain(SEEDED_CHARACTER_NAME);
    expect(html).not.toContain(SEEDED_QUOTE);
    expect(html).not.toMatch(/#0001\b/);

    // OG meta on tamper path must NOT include piece info either.
    expect(html).not.toMatch(
      /property="og:title"\s+content="[^"]*Test Subject[^"]*"/,
    );
    expect(html).toMatch(/Verification failed/i);
  });

  test("unknown UID renders the not-found panel", async ({ page }) => {
    await page.goto("/en/v/DEADBEEFCAFE00?t=00000000000000000000000a");
    await expect(page.getByTestId("verification-not-found")).toBeVisible();
    await expect(page.getByTestId("verification-piece-number")).toHaveCount(0);
  });
});
