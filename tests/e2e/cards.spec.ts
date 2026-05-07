import { test, expect } from "@playwright/test";
import { ADMIN_STATE_PATH, COLLECTOR_STATE_PATH } from "./fixtures/auth";

const SEEDED_PIECE_ID = "00000000-0000-0000-0000-000000000001";

test.describe("Phase 3 — card PDFs", () => {
  test.beforeAll(() => {
    if (!process.env.HMAC_SECRET) {
      throw new Error("HMAC_SECRET must be set for cards.spec.ts");
    }
  });

  test.describe("admin", () => {
    test.use({ storageState: ADMIN_STATE_PATH });

    test("returns a valid PDF with expected headers", async ({ request }) => {
      const res = await request.get(`/api/admin/cards/${SEEDED_PIECE_ID}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("application/pdf");
      const disposition = res.headers()["content-disposition"] ?? "";
      // RFC 6266: must be an attachment with a quoted ASCII filename ending
      // in .pdf, and an RFC 5987 filename* echoing the same name in UTF-8.
      // Both are required so neither legacy clients (filename) nor strict
      // ones (filename*) ever fall back to the URL — which is a bare UUID.
      expect(disposition).toMatch(
        /attachment; filename="nachi3d-certify-piece-\d{4}\.pdf"/,
      );
      expect(disposition).toContain("filename=");
      expect(disposition).toContain(".pdf");
      expect(disposition).toMatch(/filename\*=UTF-8''[^;]*\.pdf/);
      const body = await res.body();
      // PDF magic bytes: %PDF
      expect(body.subarray(0, 4).toString("ascii")).toBe("%PDF");
      expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(body.byteLength).toBeGreaterThan(1024);
    });

    test("download link on the edit page suggests a .pdf filename", async ({
      page,
    }) => {
      // The server response is correct in isolation, but if the <a> tag
      // lacks a download attribute the browser falls back to the URL
      // (a bare UUID) when the user does "save link as" or right-clicks.
      // Lock the link's download attribute in place so this regresses
      // loudly next time someone touches the edit page.
      await page.goto(`/en/admin/pieces/${SEEDED_PIECE_ID}/edit`);
      const link = page.getByTestId("card-pdf-link");
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `/api/admin/cards/${SEEDED_PIECE_ID}`);
      await expect(link).toHaveAttribute(
        "download",
        /^nachi3d-certify-piece-\d{4}\.pdf$/,
      );
    });

    test("second request hits the cache (X-Cache: HIT)", async ({
      request,
    }) => {
      // First request primes the cache. We don't assume anything about this
      // request — could be MISS (cold) or HIT (warm from a previous test).
      const first = await request.get(`/api/admin/cards/${SEEDED_PIECE_ID}`);
      expect(first.status()).toBe(200);

      // Second request must come from the bucket.
      const second = await request.get(`/api/admin/cards/${SEEDED_PIECE_ID}`);
      expect(second.status()).toBe(200);
      expect(second.headers()["x-cache"]).toBe("HIT");
    });
  });

  test.describe("non-admin", () => {
    test.use({ storageState: COLLECTOR_STATE_PATH });

    test("non-admin GET is rejected with 403", async ({ request }) => {
      const res = await request.get(`/api/admin/cards/${SEEDED_PIECE_ID}`);
      expect(res.status()).toBe(403);
    });
  });

  test("anonymous GET is rejected with 401", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const res = await ctx.request.get(`/api/admin/cards/${SEEDED_PIECE_ID}`);
    expect(res.status()).toBe(401);
    await ctx.close();
  });
});
