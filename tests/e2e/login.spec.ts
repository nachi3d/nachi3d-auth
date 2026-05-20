import { test, expect } from "@playwright/test";
import {
  ADMIN_STATE_PATH,
  SEED_ADMIN,
  SEED_COLLECTOR,
} from "./fixtures/auth";

test.describe("Phase 5-prep — login", () => {
  test.describe("logged-out flows", () => {
    // Run every test in this describe with a fresh, anonymous context so
    // the cookie jar is empty and the login form is the entry point.
    test.use({ storageState: { cookies: [], origins: [] } });

    test("valid admin credentials redirect to /admin", async ({ page }) => {
      await page.goto("/en/login");
      await expect(page.getByTestId("login-card")).toBeVisible();

      await page.getByTestId("login-email").fill(SEED_ADMIN.email);
      await page.getByTestId("login-password").fill(SEED_ADMIN.password);
      await page.getByTestId("login-submit").click();

      await page.waitForURL(/\/en\/admin(\?.*)?$/);
      await expect(page.getByTestId("admin-gate")).toBeVisible();
      await expect(page.getByTestId("admin-current-email")).toHaveText(
        SEED_ADMIN.email,
      );
    });

    test("non-admin credentials sign in and land on /me", async ({
      page,
    }) => {
      await page.goto("/en/login");
      await page.getByTestId("login-email").fill(SEED_COLLECTOR.email);
      await page.getByTestId("login-password").fill(SEED_COLLECTOR.password);
      await page.getByTestId("login-submit").click();

      // Collectors are routed to their own dashboard, not refused.
      await page.waitForURL(/\/en\/me(\?.*)?$/);
      await expect(page.getByTestId("me-dashboard")).toBeVisible();
    });

    test("non-admin visiting /admin is redirected to /me with banner", async ({
      page,
    }) => {
      // Sign in as the collector first so we hit the admin gate as an
      // authenticated non-admin (not as an anonymous visitor).
      await page.goto("/en/login");
      await page.getByTestId("login-email").fill(SEED_COLLECTOR.email);
      await page.getByTestId("login-password").fill(SEED_COLLECTOR.password);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/en\/me(\?.*)?$/);

      await page.goto("/en/admin");
      await page.waitForURL(/\/en\/me\?admin_only=1$/);
      const banner = page.getByTestId("me-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute("data-banner-code", "admin_only");
    });

    test("bad credentials show the generic invalid error", async ({ page }) => {
      await page.goto("/en/login");
      await page.getByTestId("login-email").fill("nobody@nachi3d.test");
      await page.getByTestId("login-password").fill("wrong-password-fixture");
      await page.getByTestId("login-submit").click();

      const err = page.getByTestId("login-error");
      // Cold-compiled /en/login + remote Supabase signInWithPassword round
      // trip routinely lands in the 5–10s range — same latency profile as
      // the v0.4.0 timeout bumps in gallery.spec.ts / admin-pieces.spec.ts.
      await expect(err).toBeVisible({ timeout: 15000 });
      await expect(err).toHaveAttribute("data-error-code", "invalid");
      // Still on /login, not redirected anywhere.
      expect(new URL(page.url()).pathname).toBe("/en/login");
    });

    test("unauthenticated visit to /admin redirects to /login", async ({
      page,
    }) => {
      const res = await page.goto("/en/admin");
      // Server-side redirect — the final URL is /login (with no error
      // banner because no failed gate happened on /admin itself).
      await page.waitForURL(/\/en\/login(\?.*)?$/);
      // The response object is for the final navigation; assert the page
      // resolves to a 200 once it lands on /login.
      expect(res?.status()).toBeLessThan(400);
      await expect(page.getByTestId("login-card")).toBeVisible();
    });

    test("/login surfaces both magic-link and password methods", async ({
      page,
    }) => {
      await page.goto("/en/login");
      // Both forms render on the same card, separated by a divider.
      await expect(page.getByTestId("login-magic-link-form")).toBeVisible();
      await expect(page.getByTestId("login-password-form")).toBeVisible();
      await expect(page.getByTestId("login-divider")).toBeVisible();
      // The primary magic-link CTA + secondary password submit are both
      // reachable from the same screen.
      await expect(page.getByTestId("login-magic-link-submit")).toBeVisible();
      await expect(page.getByTestId("login-submit")).toBeVisible();
    });

    test("magic-link submit with invalid email shows a field-level error", async ({
      page,
    }) => {
      await page.goto("/en/login");
      await page.getByTestId("login-email").fill("not-an-email");
      await page.getByTestId("login-magic-link-submit").click();
      const err = page.getByTestId("login-magic-link-error");
      await expect(err).toBeVisible();
      await expect(err).toHaveAttribute("data-error-code", "emailValidation");
      // No success state appeared.
      await expect(page.getByTestId("login-magic-link-success")).toHaveCount(0);
      // Still on /login, not navigated anywhere.
      expect(new URL(page.url()).pathname).toBe("/en/login");
    });

    test("magic-link submit with a valid email shows success + disables the email field", async ({
      page,
    }) => {
      await page.goto("/en/login");
      await page.getByTestId("login-email").fill(SEED_COLLECTOR.email);
      await page.getByTestId("login-magic-link-submit").click();

      // signInWithOtp is suppressed in test mode; the API still returns
      // ok and the form flips to the success state with the resend
      // affordance + a disabled email input.
      await expect(
        page.getByTestId("login-magic-link-success"),
      ).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId("login-email")).toBeDisabled();
      await expect(page.getByTestId("login-magic-link-resend")).toBeVisible();
      // No error surfaced.
      await expect(page.getByTestId("login-magic-link-error")).toHaveCount(0);
    });

    test("magic-link API returns the next URL synchronously in test mode", async ({
      request,
    }) => {
      // The route mirrors claim/transfer initiate: in test mode it
      // skips signInWithOtp and surfaces the next path the spec would
      // otherwise have to extract from an email.
      const res = await request.post("/api/login/magic-link", {
        data: { email: SEED_COLLECTOR.email, locale: "en" },
      });
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as {
        ok?: boolean;
        next?: string;
        email_redirect_to?: string;
      };
      expect(body.ok).toBe(true);
      expect(body.next).toBe("/en/me");
      expect(body.email_redirect_to).toMatch(
        /\/auth\/callback\?next=%2Fen%2Fme$/,
      );
    });

    test("magic-link API rejects an obviously malformed email with 400", async ({
      request,
    }) => {
      const res = await request.post("/api/login/magic-link", {
        data: { email: "not-an-email", locale: "en" },
      });
      expect(res.status()).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe("validation_error");
    });
  });

  test.describe("admin-authenticated flows", () => {
    test.use({ storageState: ADMIN_STATE_PATH });

    // This runs before the logout test on purpose: the logout test
    // signs out via Supabase, which invalidates the shared admin
    // session globally. The logout test then uses its own fresh
    // sign-in so future test runs (and other spec files in the same
    // run) don't inherit a revoked token.
    test("already-authenticated admin hitting /login is redirected to /admin", async ({
      page,
    }) => {
      await page.goto("/en/login");
      await page.waitForURL(/\/en\/admin(\?.*)?$/);
      await expect(page.getByTestId("admin-gate")).toBeVisible();
    });
  });

  test("logout button signs out and redirects to /login", async ({
    browser,
    baseURL,
  }) => {
    // Use an isolated context with its own freshly-minted session so
    // the global signOut triggered by clicking logout does not revoke
    // the shared ADMIN_STATE_PATH session that other specs/tests rely
    // on. Sign in via /api/test/signin (the same path globalSetup uses).
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      const signin = await ctx.request.post("/api/test/signin", {
        data: { email: SEED_ADMIN.email, password: SEED_ADMIN.password },
      });
      expect(signin.ok()).toBeTruthy();

      const page = await ctx.newPage();
      await page.goto("/en/admin");
      await expect(page.getByTestId("admin-topbar")).toBeVisible();
      await expect(page.getByTestId("admin-current-email")).toHaveText(
        SEED_ADMIN.email,
      );

      await page.getByTestId("admin-logout").click();
      await page.waitForURL(/\/en\/login(\?.*)?$/);

      const sbCookies = (await ctx.cookies()).filter((c) =>
        c.name.startsWith("sb-"),
      );
      expect(sbCookies).toEqual([]);

      // /admin is now gated again.
      await page.goto("/en/admin");
      await page.waitForURL(/\/en\/login(\?.*)?$/);
    } finally {
      await ctx.close();
    }
  });
});
