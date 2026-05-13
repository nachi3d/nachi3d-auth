import { test, expect } from "@playwright/test";
import {
  ADMIN_STATE_PATH,
  SEED_ADMIN,
  SEED_COLLECTOR,
} from "./fixtures/auth";

test.describe("Phase 5-prep — admin login", () => {
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

    test("non-admin credentials are rejected, user is signed out", async ({
      page,
      context,
    }) => {
      await page.goto("/en/login");
      await page.getByTestId("login-email").fill(SEED_COLLECTOR.email);
      await page.getByTestId("login-password").fill(SEED_COLLECTOR.password);
      await page.getByTestId("login-submit").click();

      // The action signs the user out and redirects back to /login with
      // the access_denied banner visible.
      await page.waitForURL(/\/en\/login\?error=access_denied$/);
      await expect(
        page.getByTestId("login-banner-access-denied"),
      ).toBeVisible();

      // Verify the session was actually cleared — the @supabase/ssr
      // cookies should not be present after the action ran.
      const cookies = await context.cookies();
      const sbCookies = cookies.filter((c) => c.name.startsWith("sb-"));
      expect(sbCookies).toEqual([]);

      // And /admin is still gated.
      await page.goto("/en/admin");
      await page.waitForURL(/\/en\/login(\?.*)?$/);
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
