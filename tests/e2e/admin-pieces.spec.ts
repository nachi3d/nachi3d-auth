import { test, expect } from "@playwright/test";
import { signToken } from "@/lib/hmac";
import {
  ADMIN_STATE_PATH,
  COLLECTOR_STATE_PATH,
} from "./fixtures/auth";

const SEEDED_PIECE_ID = "00000000-0000-0000-0000-000000000001";
const SEEDED_UID = "04A1B2C3D4E580";

function uniqueUid(prefix: string): string {
  // 14 hex chars, real-looking NTAG215 7-byte UID
  const rand = Math.floor(Math.random() * 0xffff_ffff_ffff)
    .toString(16)
    .toUpperCase()
    .padStart(12, "F");
  return (prefix + rand).slice(0, 14).padEnd(14, "0");
}

test.describe("Phase 2 — admin pieces", () => {
  test.beforeAll(() => {
    if (!process.env.HMAC_SECRET) {
      throw new Error(
        "HMAC_SECRET must be set in .env.local for admin-pieces.spec.ts",
      );
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL must be set for the auth fixture to seed sessions",
      );
    }
  });

  test.describe("admin context", () => {
    test.use({ storageState: ADMIN_STATE_PATH });

    test("register-then-verify roundtrip", async ({ page, browser }) => {
      const uid = uniqueUid("AB");

      await page.goto("/en/admin/pieces/new");
      await page.getByTestId("field-nfc_uid").fill(uid);
      await page.getByTestId("field-character_name").fill("Roundtrip Subject");
      await page.getByTestId("field-piece_number").fill("9001");
      await page.getByTestId("field-sculpt_date").fill("2026-04-01");
      await page.getByTestId("field-paint_date").fill("2026-04-15");
      await page.getByTestId("publish").click();

      await page.waitForURL(/\/admin\/pieces\/[0-9a-f-]+\/edit/);
      const url = (await page
        .getByTestId("verification-url")
        .textContent())?.trim();
      expect(url).toBeTruthy();
      expect(url).toContain(`/v/${uid.toUpperCase()}`);

      // Visit the verification URL in a fresh, unauthenticated context.
      const anon = await browser.newContext({ storageState: undefined });
      const anonPage = await anon.newPage();
      const path = new URL(url!).pathname + new URL(url!).search;
      const response = await anonPage.goto(path);
      expect(response?.status()).toBe(200);
      await expect(
        anonPage.getByTestId("verification-piece-number"),
      ).toContainText("#9001");
      await anon.close();
    });

    test("locked uid: UI is disabled on a published piece", async ({ page }) => {
      await page.goto(`/en/admin/pieces/${SEEDED_PIECE_ID}/edit`);
      const uidInput = page.getByTestId("field-nfc_uid");
      await expect(uidInput).toBeDisabled();
      await expect(uidInput).toHaveValue(SEEDED_UID);
    });

    test("locked uid: direct API call to PATCH with new uid is rejected", async ({
      request,
    }) => {
      const res = await request.patch(
        `/api/admin/pieces/${SEEDED_PIECE_ID}`,
        {
          data: { nfc_uid: "ABCDEF0123456789" },
        },
      );
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("uid_locked");
    });

    test("nfc uid uniqueness rejected at insert", async ({ request }) => {
      // Use the seeded UID in a new piece insert — must collide.
      const res = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: SEEDED_UID,
          piece_number: 9999,
          edition_number: null,
          edition_total: null,
          character_name: "Should not save",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
        },
      });
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("duplicate");
      expect(body.fields?.nfc_uid).toBeTruthy();
    });
  });

  test.describe("non-admin context", () => {
    test.use({ storageState: COLLECTOR_STATE_PATH });

    test("non-admin POST /api/admin/pieces is rejected with 403", async ({
      request,
    }) => {
      const res = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: uniqueUid("CD"),
          piece_number: 9100,
          edition_number: null,
          edition_total: null,
          character_name: "Should be blocked",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
        },
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("forbidden");
    });

    test("non-admin reaching /admin/pieces is redirected away", async ({
      page,
    }) => {
      await page.goto("/en/admin/pieces");
      // redirected to /admin (which renders the "not authorized" panel)
      await expect(page.getByTestId("admin-gate-denied")).toBeVisible();
    });
  });

  // Phase 1 verification spec parity check — keeps the public path covered
  // alongside the new admin paths.
  test("seeded piece still verifies with a freshly signed token", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    const token = signToken(SEEDED_UID, SEEDED_PIECE_ID);
    const res = await page.goto(`/en/v/${SEEDED_UID}?t=${token}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("verification-piece-number")).toContainText(
      "#0001",
    );
    await ctx.close();
  });
});
