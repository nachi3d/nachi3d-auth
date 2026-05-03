import { test, expect } from "@playwright/test";
import { signToken } from "@/lib/hmac";

// Must match supabase/seed.sql
const TEST_PIECE_ID = "00000000-0000-0000-0000-000000000001";
const TEST_NFC_UID = "04A1B2C3D4E580";

test.describe("Verification page", () => {
  test.beforeAll(() => {
    if (!process.env.HMAC_SECRET) {
      throw new Error(
        "HMAC_SECRET must be set (in .env.local or the test environment) " +
          "for verification.spec.ts to compute valid tokens.",
      );
    }
  });

  test("valid token renders the seeded piece", async ({ page }) => {
    const token = signToken(TEST_NFC_UID, TEST_PIECE_ID);
    const response = await page.goto(`/en/v/${TEST_NFC_UID}?t=${token}`);

    expect(response?.status()).toBe(200);
    await expect(
      page.getByTestId("verification-piece-number"),
    ).toContainText("#0001");
    await expect(
      page.getByTestId("verification-character-name"),
    ).toBeVisible();
  });

  test("invalid token renders the tamper page", async ({ page }) => {
    await page.goto(`/en/v/${TEST_NFC_UID}?t=invalidtoken000000000000`);

    await expect(
      page.getByTestId("verification-tamper-banner"),
    ).toBeVisible();
    await expect(
      page.getByTestId("verification-piece-number"),
    ).toHaveCount(0);
  });
});
