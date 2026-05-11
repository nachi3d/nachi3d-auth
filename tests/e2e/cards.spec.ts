import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
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

    test("clicking the link triggers a real PDF download", async ({ page }) => {
      // The attribute test above only proves the markup is right. It does not
      // prove the click actually results in a download — a parent click
      // handler, Server Actions form interception, or a service worker could
      // all swallow the navigation and leave the user staring at nothing.
      // Drive a real click and wait for the browser's download event.
      await page.goto(`/en/admin/pieces/${SEEDED_PIECE_ID}/edit`);
      const link = page.getByTestId("card-pdf-link");
      await expect(link).toBeVisible();

      const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
      await link.click();
      const download = await downloadPromise;

      const suggested = download.suggestedFilename();
      expect(suggested).toMatch(/^nachi3d-certify-piece-\d{4}\.pdf$/);
      expect(suggested.endsWith(".pdf")).toBe(true);

      const savedPath = await download.path();
      expect(savedPath).not.toBeNull();
      const bytes = await readFile(savedPath!);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
      expect(bytes.byteLength).toBeGreaterThan(1024);
    });

    test("rendered text is complete on both pages (no glyph dropouts)", async ({
      request,
    }) => {
      // Regression test for a previous bug where pdf-lib's font subsetter
      // mangled glyph IDs (variable fonts + GSUB/GPOS layout tables in
      // upstream OFL TTFs) and rendered partial words on the card —
      // "Nachi3D" came out as "i3D" then "ach", "Test Subject" as
      // "T   Subj  c", entire Arabic notice as scattered boxes. The PDF
      // text stream was intact (pdf-parse recovered it via ToUnicode)
      // but the visible glyphs were wrong. The fonts are now pre-subset
      // by scripts/prepare-fonts.py and embedded with `subset: false`;
      // this test guards that pipeline.
      //
      // pdf-parse reads the same ToUnicode entries the previous bug
      // preserved, so a passing test here is necessary but not sufficient
      // for visual correctness. It IS sufficient to catch the next class
      // of regression: someone re-introducing pdf-lib subsetting, or
      // shipping a TTF that fails to embed at all (the route would fall
      // back to Helvetica and the strings would still appear).
      const res = await request.get(`/api/admin/cards/${SEEDED_PIECE_ID}`);
      expect(res.status()).toBe(200);
      const body = Buffer.from(await res.body());

      const parser = new PDFParse({ data: new Uint8Array(body) });
      const parsed = await parser.getText();
      const text = parsed.text;

      // Front: every word the design draws must appear in full, exactly
      // as written — substring matches, no regex tolerance.
      expect(text).toContain("Nachi3D");
      expect(text).toContain("CERTIFY");
      expect(text).toContain("Test Subject");
      expect(text).toContain(
        "Authenticity is what you carry, not what you claim.",
      );
      expect(text).toContain("signed");
      expect(text).toContain("Nachi3D Certify");

      // Back: the trilingual notices and the metadata block.
      expect(text).toContain("AUTHENTICITY");
      expect(text).toContain("SCULPT");
      expect(text).toContain("PAINT");
      expect(text).toContain("EDITION");
      expect(text).toContain("PIECE");
      expect(text).toContain("#0001");
      expect(text).toContain("hello@nachi3d.com");

      // EN / FR notices: assert multiple load-bearing substrings from
      // start, middle, and end of each notice. The notices wrap onto
      // ~60-char lines in the PDF, so we can't assert a single long
      // line — instead check that fragments from across the notice all
      // survived rendering. Silent truncation would drop fragments
      // from the middle or end.
      // EN
      expect(text).toContain(
        "This card certifies the authenticity of a Nachi3D figurine.",
      );
      expect(text).toContain("embedded NFC chip");
      expect(text).toContain("verify.nachi3dlabs.com.");
      // FR
      expect(text).toContain(
        "Cette carte certifie l'authenticité d'une figurine Nachi3D.",
      );
      expect(text).toContain("Approchez la puce NFC");
      expect(text).toContain("page de");
      expect(text).toContain("vérification sur verify.nachi3dlabs.com.");

      // AR notice: we don't substring-match individual words because
      // pdf-parse returns the shaped Presentation Forms-B glyphs in
      // visual order rather than the logical-order source string. But
      // the total Arabic glyph count must be in the right ballpark —
      // the source has ~85 base Arabic letters; <80 means the AR run
      // was silently dropped or partially rendered.
      const arabicChars = [...text].filter((c) => {
        const cp = c.codePointAt(0)!;
        return (
          (cp >= 0x0600 && cp <= 0x06ff) ||
          (cp >= 0xfb50 && cp <= 0xfdff) ||
          (cp >= 0xfe70 && cp <= 0xfeff)
        );
      });
      expect(arabicChars.length).toBeGreaterThan(80);
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
