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
      expect(res.headers()["content-disposition"]).toMatch(
        /attachment; filename="nachi3d-certify-piece-\d{4}\.pdf"/,
      );
      const body = await res.body();
      // PDF magic bytes: %PDF-
      expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(body.byteLength).toBeGreaterThan(1024);
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
