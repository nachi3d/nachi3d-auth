import { test, expect } from "@playwright/test";
import { signToken } from "@/lib/hmac";

const SEEDED_UID = "04A1B2C3D4E580";
const SEEDED_PIECE_ID = "00000000-0000-0000-0000-000000000001";

const LOCALES = ["en", "fr", "ar"] as const;
const PAGES = ["mentions", "privacy", "terms"] as const;

test.describe("Phase 5-prep — legal pages", () => {
  test.beforeAll(() => {
    if (!process.env.HMAC_SECRET) {
      throw new Error("HMAC_SECRET must be set for legal.spec.ts");
    }
  });

  // Each (locale × page) combination is a separate test so a single
  // missing translation key fails one cell, not the whole grid.
  for (const locale of LOCALES) {
    for (const page of PAGES) {
      test(`renders /${locale}/legal/${page}`, async ({ page: p }) => {
        const res = await p.goto(`/${locale}/legal/${page}`);
        expect(res?.status()).toBe(200);
        await expect(p.getByTestId(`legal-page-${page}`)).toBeVisible();
        await expect(p.getByTestId("legal-title")).toBeVisible();
        await expect(p.getByTestId("legal-last-updated")).toBeVisible();
        // At least one prose section rendered.
        await expect(p.getByTestId("legal-section-0")).toBeVisible();
        // Footer rides along on every legal page.
        await expect(p.getByTestId("site-footer")).toBeVisible();
      });
    }
  }

  test("last-updated date is locale-formatted", async ({ page }) => {
    await page.goto("/en/legal/privacy");
    // EN locale -> English month name. The const is 2026-05-15, so the
    // formatted output should include "May" and "2026".
    const text = await page.getByTestId("legal-last-updated").textContent();
    expect(text ?? "").toMatch(/May.*2026|2026.*May/);

    await page.goto("/fr/legal/privacy");
    const frText = await page
      .getByTestId("legal-last-updated")
      .textContent();
    // French Intl output for May is "mai".
    expect(frText ?? "").toMatch(/mai/i);
  });

  test("/ar legal pages render RTL", async ({ page }) => {
    await page.goto("/ar/legal/mentions");
    const dir = await page.locator("html").getAttribute("dir");
    expect(dir).toBe("rtl");
    await expect(page.getByTestId("legal-page-mentions")).toBeVisible();
  });

  test("mentions page contains required disclosure fields", async ({
    page,
  }) => {
    // The mentions content lives in i18n; assert the operator-visible
    // strings are present so a translation regression that drops the
    // hoster name or the contact email fails the build instead of
    // silently shipping.
    await page.goto("/en/legal/mentions");
    const html = await page.content();
    expect(html).toContain("Seàn McGannon");
    expect(html).toContain("Essaouira");
    expect(html).toContain("Vercel Inc.");
    expect(html).toContain("Supabase Inc.");
    expect(html).toContain("contact@nachi3d.com");
  });

  test("privacy page covers the GDPR essentials", async ({ page }) => {
    await page.goto("/en/legal/privacy");
    const html = await page.content();
    expect(html).toContain("verification_logs");
    expect(html).toContain("GDPR");
    // Legitimate interest is the basis for the verification log.
    expect(html).toMatch(/legitimate interest/i);
    // Rights enumeration must include access + erasure.
    expect(html).toMatch(/access/i);
    expect(html).toMatch(/erasure/i);
  });

  test("terms page declares governing law and asks-as-is", async ({
    page,
  }) => {
    await page.goto("/en/legal/terms");
    const html = await page.content();
    expect(html).toContain("Morocco");
    expect(html).toMatch(/as-is/i);
  });
});

test.describe("Phase 5-prep — footer", () => {
  test.beforeAll(() => {
    if (!process.env.HMAC_SECRET) {
      throw new Error("HMAC_SECRET must be set for legal.spec.ts");
    }
  });

  test("renders on landing", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByTestId("site-footer")).toBeVisible();
    await expect(page.getByTestId("site-footer-copyright")).toContainText(
      String(new Date().getFullYear()),
    );
  });

  test("renders on gallery", async ({ page }) => {
    await page.goto("/en/gallery");
    await expect(page.getByTestId("site-footer")).toBeVisible();
  });

  test("renders on login", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page.getByTestId("site-footer")).toBeVisible();
  });

  test("renders on the verification happy path", async ({ page }) => {
    const token = signToken(SEEDED_UID, SEEDED_PIECE_ID);
    await page.goto(`/en/v/${SEEDED_UID}?t=${token}`);
    await expect(page.getByTestId("site-footer")).toBeVisible();
  });

  test("absent on the tamper page", async ({ page }) => {
    await page.goto(`/en/v/${SEEDED_UID}?t=invalidtoken000000000000`);
    await expect(page.getByTestId("verification-tamper-banner")).toBeVisible();
    await expect(page.getByTestId("site-footer")).toHaveCount(0);
  });

  test("absent on the not-found panel", async ({ page }) => {
    await page.goto("/en/v/DEADBEEFCAFE00?t=00000000000000000000000a");
    await expect(page.getByTestId("verification-not-found")).toBeVisible();
    await expect(page.getByTestId("site-footer")).toHaveCount(0);
  });

  test("links navigate to the legal pages", async ({ page }) => {
    await page.goto("/fr");
    await page.getByTestId("site-footer-link-mentions").click();
    await page.waitForURL("**/fr/legal/mentions");
    await expect(page.getByTestId("legal-page-mentions")).toBeVisible();
  });

  test("links carry the current locale", async ({ page }) => {
    await page.goto("/ar");
    const href = await page
      .getByTestId("site-footer-link-privacy")
      .getAttribute("href");
    expect(href).toBe("/ar/legal/privacy");
  });
});

test.describe("Phase 5-prep — sitemap", () => {
  test("includes all three legal pages × three locales", async ({
    request,
  }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    for (const locale of LOCALES) {
      for (const page of PAGES) {
        expect(xml).toContain(`/${locale}/legal/${page}`);
      }
    }
  });
});
