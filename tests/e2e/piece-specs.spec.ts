import { test, expect, type APIRequestContext } from "@playwright/test";
import { PDFParse } from "pdf-parse";
import { signToken } from "@/lib/hmac";
import {
  ADMIN_STATE_PATH,
  COLLECTOR_STATE_PATH,
} from "./fixtures/auth";

// Reserved test piece_number range (CLAUDE.md "Data safety"): 9100–9899.
// This spec carves out 9810–9890 within that band to stay clear of the
// other admin-pieces tests.
function nextPieceNumber(base: number): number {
  return base + Math.floor(Math.random() * 10);
}

function uniqueUid(prefix: string): string {
  const rand = Math.floor(Math.random() * 0xffff_ffff_ffff)
    .toString(16)
    .toUpperCase()
    .padStart(12, "F");
  return (prefix + rand).slice(0, 14).padEnd(14, "0");
}

const createdPieceIds = new Set<string>();

async function cleanupCreated(request: APIRequestContext): Promise<void> {
  const ids = Array.from(createdPieceIds);
  createdPieceIds.clear();
  await Promise.all(
    ids.map(async (id) => {
      try {
        await request.delete(`/api/admin/pieces/${id}`);
      } catch (e) {
        console.warn(
          `[piece-specs.spec] cleanup: delete ${id} failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }),
  );
}

interface CreateOpts {
  request: APIRequestContext;
  uid?: string;
  piece_number?: number;
  status?: "draft" | "published";
  specs?: Partial<{
    height_mm: number | null;
    base_width_mm: number | null;
    weight_g: number | null;
    material: string | null;
    scale: string | null;
    variant_label: string | null;
  }>;
}

async function createTestPiece(opts: CreateOpts): Promise<{
  id: string;
  uid: string;
  piece_number: number;
}> {
  const uid = opts.uid ?? uniqueUid("AE");
  const piece_number = opts.piece_number ?? nextPieceNumber(9810);
  const res = await opts.request.post("/api/admin/pieces", {
    data: {
      nfc_uid: uid,
      piece_number,
      edition_number: null,
      edition_total: null,
      character_name: "Specs Subject",
      character_quote: null,
      license_status: "original",
      license_notes: null,
      sculpt_date: "2026-04-01",
      paint_date: "2026-04-15",
      photos: [],
      status: opts.status ?? "published",
      ...opts.specs,
    },
  });
  expect(res.status()).toBe(201);
  const { piece } = (await res.json()) as { piece: { id: string } };
  createdPieceIds.add(piece.id);
  return { id: piece.id, uid, piece_number };
}

test.describe("Phase 5-prep — physical characteristics", () => {
  test.beforeAll(() => {
    if (!process.env.HMAC_SECRET) {
      throw new Error(
        "HMAC_SECRET must be set in .env.local for piece-specs.spec.ts",
      );
    }
  });

  test.describe("admin context", () => {
    test.use({ storageState: ADMIN_STATE_PATH });

    test.afterEach(async ({ request }) => {
      await cleanupCreated(request);
    });

    test("all six specs persist through the JSON API", async ({ request }) => {
      const created = await createTestPiece({
        request,
        status: "draft",
        specs: {
          height_mm: 120.5,
          base_width_mm: 45,
          weight_g: 340.5,
          material: "Résine 8K + socle bois",
          scale: "75mm",
          variant_label: "Taille L",
        },
      });
      const get = await request.get(`/api/admin/pieces/${created.id}`);
      expect(get.status()).toBe(200);
      const { piece } = (await get.json()) as {
        piece: Record<string, unknown>;
      };
      // Postgres numeric round-trips as a string via PostgREST; normalize
      // by coercing to Number for comparison.
      expect(Number(piece.height_mm)).toBe(120.5);
      expect(Number(piece.base_width_mm)).toBe(45);
      expect(Number(piece.weight_g)).toBe(340.5);
      expect(piece.material).toBe("Résine 8K + socle bois");
      expect(piece.scale).toBe("75mm");
      expect(piece.variant_label).toBe("Taille L");
    });

    test("admin form: empty number inputs save as NULL, not 0", async ({
      page,
      request,
    }) => {
      test.setTimeout(60_000);
      const uid = uniqueUid("BF");
      const piece_number = nextPieceNumber(9820);

      await page.goto("/en/admin/pieces/new");
      await page.getByTestId("field-nfc_uid").fill(uid);
      await page.getByTestId("field-character_name").fill("Empty Specs");
      await page.getByTestId("field-piece_number").fill(String(piece_number));
      await page.getByTestId("field-sculpt_date").fill("2026-04-01");
      await page.getByTestId("field-paint_date").fill("2026-04-15");
      // Deliberately leave all spec inputs empty.
      await page.getByTestId("save-draft").click();

      await page.waitForURL(/\/admin\/pieces\/([0-9a-f-]+)\/edit/);
      const editUrl = page.url();
      const createdId = editUrl.match(/\/pieces\/([0-9a-f-]+)\/edit/)?.[1];
      expect(createdId).toBeTruthy();
      createdPieceIds.add(createdId!);

      const get = await request.get(`/api/admin/pieces/${createdId}`);
      expect(get.status()).toBe(200);
      const { piece } = (await get.json()) as {
        piece: Record<string, unknown>;
      };
      expect(piece.height_mm).toBeNull();
      expect(piece.base_width_mm).toBeNull();
      expect(piece.weight_g).toBeNull();
      expect(piece.material).toBeNull();
      expect(piece.scale).toBeNull();
      expect(piece.variant_label).toBeNull();
    });

    test("zod rejects negative numbers", async ({ request }) => {
      const res = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: uniqueUid("CF"),
          piece_number: nextPieceNumber(9830),
          edition_number: null,
          edition_total: null,
          character_name: "Negative",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
          height_mm: -1,
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("validation_error");
      expect(body.fields?.height_mm).toBeTruthy();
    });

    test("zod rejects over-length text fields", async ({ request }) => {
      // material max is 80 chars
      const res = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: uniqueUid("DF"),
          piece_number: nextPieceNumber(9840),
          edition_number: null,
          edition_total: null,
          character_name: "Long",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
          material: "x".repeat(81),
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("validation_error");
      expect(body.fields?.material).toBeTruthy();
    });

    test("PDF: piece with all specs filled renders without overflow and includes spec labels", async ({
      request,
    }) => {
      const created = await createTestPiece({
        request,
        status: "draft",
        specs: {
          height_mm: 120.5,
          base_width_mm: 45,
          weight_g: 340.5,
          material: "Résine 8K + socle bois",
          scale: "75mm",
          variant_label: "Taille L",
        },
      });
      const res = await request.get(`/api/admin/cards/${created.id}`);
      expect(res.status()).toBe(200);
      const body = Buffer.from(await res.body());
      // PDF magic + reasonable size
      expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(body.byteLength).toBeGreaterThan(1024);

      const parser = new PDFParse({ data: new Uint8Array(body) });
      const parsed = await parser.getText();
      const text = parsed.text;

      // Spec labels visible on the back of the card
      expect(text).toContain("HEIGHT");
      expect(text).toContain("BASE");
      expect(text).toContain("WEIGHT");
      expect(text).toContain("MATERIAL");
      expect(text).toContain("SCALE");
      expect(text).toContain("VARIANT");
      // Values
      expect(text).toContain("120.5 mm");
      expect(text).toContain("340.5 g");
      expect(text).toContain("75mm");
      expect(text).toContain("Taille L");
      // Pre-existing meta block must still be present (regression guard)
      expect(text).toContain("SCULPT");
      expect(text).toContain("PAINT");
      expect(text).toContain("PIECE");
      // Support email still anchored at the bottom (no overflow off-page)
      expect(text).toContain("hello@nachi3d.com");
    });

    test("PDF: piece with zero specs renders without any spec labels", async ({
      request,
    }) => {
      const created = await createTestPiece({
        request,
        status: "draft",
      });
      const res = await request.get(`/api/admin/cards/${created.id}`);
      expect(res.status()).toBe(200);
      const body = Buffer.from(await res.body());
      const parser = new PDFParse({ data: new Uint8Array(body) });
      const parsed = await parser.getText();
      const text = parsed.text;

      // Existing meta still there
      expect(text).toContain("SCULPT");
      expect(text).toContain("PIECE");
      // Spec labels MUST be absent — the section is omitted entirely
      expect(text).not.toContain("HEIGHT");
      expect(text).not.toContain("BASE");
      expect(text).not.toContain("WEIGHT");
      expect(text).not.toContain("MATERIAL");
      expect(text).not.toContain("SCALE");
      expect(text).not.toContain("VARIANT");
    });
  });

  test.describe("verification page", () => {
    test.describe("admin setup", () => {
      test.use({ storageState: ADMIN_STATE_PATH });

      test.afterEach(async ({ request }) => {
        await cleanupCreated(request);
      });

      test("renders only non-null spec rows (partial fill)", async ({
        request,
        browser,
      }) => {
        const created = await createTestPiece({
          request,
          status: "published",
          specs: {
            height_mm: 95.5,
            weight_g: 220,
          },
        });

        const ctx = await browser.newContext({ storageState: undefined });
        const page = await ctx.newPage();
        const token = signToken(created.uid, created.id);
        const res = await page.goto(
          `/en/v/${created.uid}?t=${token}`,
        );
        expect(res?.status()).toBe(200);

        await expect(page.getByTestId("verification-specs")).toBeVisible();
        await expect(page.getByTestId("spec-row-height_mm")).toContainText(
          "95.5 mm",
        );
        await expect(page.getByTestId("spec-row-weight_g")).toContainText(
          "220.0 g",
        );
        await expect(page.getByTestId("spec-row-base_width_mm")).toHaveCount(0);
        await expect(page.getByTestId("spec-row-material")).toHaveCount(0);
        await expect(page.getByTestId("spec-row-scale")).toHaveCount(0);
        await expect(page.getByTestId("spec-row-variant_label")).toHaveCount(0);
        await ctx.close();
      });

      test("renders no section when no specs are set", async ({
        request,
        browser,
      }) => {
        const created = await createTestPiece({
          request,
          status: "published",
        });

        const ctx = await browser.newContext({ storageState: undefined });
        const page = await ctx.newPage();
        const token = signToken(created.uid, created.id);
        const res = await page.goto(`/en/v/${created.uid}?t=${token}`);
        expect(res?.status()).toBe(200);

        // Other sections still render (regression guard)
        await expect(
          page.getByTestId("verification-character-name"),
        ).toBeVisible();
        await expect(page.getByTestId("provenance-timeline")).toBeVisible();
        // Specs section is omitted entirely
        await expect(page.getByTestId("verification-specs")).toHaveCount(0);
        await ctx.close();
      });

      test("variant_label appears in the prominent badge near the character name", async ({
        request,
        browser,
      }) => {
        const created = await createTestPiece({
          request,
          status: "published",
          specs: {
            variant_label: "Taille L",
          },
        });

        const ctx = await browser.newContext({ storageState: undefined });
        const page = await ctx.newPage();
        const token = signToken(created.uid, created.id);
        await page.goto(`/en/v/${created.uid}?t=${token}`);

        const badge = page.getByTestId("verification-variant-label");
        await expect(badge).toBeVisible();
        await expect(badge).toContainText("Taille L");
        // Also appears in the specs section
        await expect(page.getByTestId("spec-row-variant_label")).toContainText(
          "Taille L",
        );
        await ctx.close();
      });

      test("RTL: /ar verification page renders the specs section", async ({
        request,
        browser,
      }) => {
        const created = await createTestPiece({
          request,
          status: "published",
          specs: {
            height_mm: 120,
            material: "Résine 8K",
          },
        });

        const ctx = await browser.newContext({ storageState: undefined });
        const page = await ctx.newPage();
        const token = signToken(created.uid, created.id);
        const res = await page.goto(`/ar/v/${created.uid}?t=${token}`);
        expect(res?.status()).toBe(200);

        // RTL direction is set at the <html> level by the middleware
        const dir = await page.locator("html").getAttribute("dir");
        expect(dir).toBe("rtl");

        await expect(page.getByTestId("verification-specs")).toBeVisible();
        await expect(page.getByTestId("spec-row-height_mm")).toBeVisible();
        await expect(page.getByTestId("spec-row-material")).toContainText(
          "Résine 8K",
        );
        await ctx.close();
      });

      test("FR locale formats decimals with a comma", async ({
        request,
        browser,
      }) => {
        const created = await createTestPiece({
          request,
          status: "published",
          specs: { height_mm: 120.5 },
        });

        const ctx = await browser.newContext({ storageState: undefined });
        const page = await ctx.newPage();
        const token = signToken(created.uid, created.id);
        await page.goto(`/fr/v/${created.uid}?t=${token}`);
        await expect(page.getByTestId("spec-row-height_mm")).toContainText(
          "120,5 mm",
        );
        await ctx.close();
      });
    });
  });

  test.describe("non-admin context", () => {
    test.use({ storageState: COLLECTOR_STATE_PATH });

    test("non-admin POST with spec fields is still rejected with 403", async ({
      request,
    }) => {
      const res = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: uniqueUid("EF"),
          piece_number: nextPieceNumber(9850),
          edition_number: null,
          edition_total: null,
          character_name: "Blocked",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
          height_mm: 100,
        },
      });
      expect(res.status()).toBe(403);
    });
  });
});
