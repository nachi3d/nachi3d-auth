import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  ADMIN_STATE_PATH,
  COLLECTOR_STATE_PATH,
  SEED_ADMIN,
  SEED_COLLECTOR,
  ensureSignedInState,
} from "./fixtures/auth";
import {
  SEED_ADMIN_ID,
  SEED_COLLECTOR_ID,
  SEED_COLLECTOR_PASSWORD,
} from "../../scripts/seed-remote";

// Why this spec doesn't `test.use({ storageState: COLLECTOR_STATE_PATH })`:
//
// Both `supabase.auth.updateUser({ password })` (used by the /me form
// under test) and `auth.admin.updateUserById({ password })` (the
// service-role admin path we use to restore the canonical password)
// revoke ALL existing sessions for the affected user. The cookies in
// COLLECTOR_STATE_PATH are minted by globalSetup before any spec runs
// — once we mutate the collector's password they reference a revoked
// session and every subsequent spec that depends on that file (public
// header, gallery, etc.) starts failing because the load looks like a
// logged-out collector.
//
// So: each test in this spec signs in inline via `/api/test/signin`
// against the current password, runs its assertions in an isolated
// context, and the `test.afterAll` hook re-runs `ensureSignedInState`
// to refresh COLLECTOR_STATE_PATH for the rest of the suite.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function clearCollectorPassword() {
  const { error } = await admin().rpc("e2e_clear_user_password", {
    p_user_id: SEED_COLLECTOR_ID,
  });
  if (error) throw new Error(`clearCollectorPassword: ${error.message}`);
}

async function restoreCollectorPassword() {
  const { error } = await admin().auth.admin.updateUserById(SEED_COLLECTOR_ID, {
    password: SEED_COLLECTOR_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`restoreCollectorPassword: ${error.message}`);
}

async function signInCollector(ctx: BrowserContext, password: string) {
  const res = await ctx.request.post("/api/test/signin", {
    data: { email: SEED_COLLECTOR.email, password },
  });
  if (!res.ok()) {
    throw new Error(`signInCollector: ${res.status()} ${await res.text()}`);
  }
}

const STRONG_PASSWORD = "Test-pwd-2026-do-not-use";

test.describe("Phase 5-prep — /me password subsection", () => {
  test.describe.configure({ mode: "serial" });

  // Every password mutation in this spec revokes the affected user's
  // existing sessions. Both COLLECTOR_STATE_PATH (touched by most
  // tests) and ADMIN_STATE_PATH (touched by the final service-role
  // grants check, which rotates the admin password) end up pointing
  // at revoked sessions. Restore the canonical passwords + re-mint
  // both storage state files so the rest of the suite — public-header,
  // transfer, piece-specs, etc. — picks up fresh, valid sessions.
  test.afterAll(async () => {
    await restoreCollectorPassword();
    const baseURL =
      process.env.PLAYWRIGHT_BASE_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;
    await ensureSignedInState(SEED_COLLECTOR, COLLECTOR_STATE_PATH, baseURL);
    await ensureSignedInState(SEED_ADMIN, ADMIN_STATE_PATH, baseURL);
  });

  test("password-less collector sees the 'Set a password' summary", async ({
    browser,
    baseURL,
  }) => {
    await restoreCollectorPassword();
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      await signInCollector(ctx, SEED_COLLECTOR_PASSWORD);
      await clearCollectorPassword();

      const page = await ctx.newPage();
      await page.goto("/en/me");
      const section = page.getByTestId("me-password");
      await expect(section).toBeVisible();
      await expect(section).toHaveAttribute("data-has-password", "false");
      await expect(page.getByTestId("me-password-set")).toBeVisible();
      await expect(page.getByTestId("me-password-change")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("valid password submission flips state and shows success", async ({
    browser,
    baseURL,
  }) => {
    await restoreCollectorPassword();
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      await signInCollector(ctx, SEED_COLLECTOR_PASSWORD);
      await clearCollectorPassword();

      const page = await ctx.newPage();
      await page.goto("/en/me");
      await page.getByTestId("me-password-set").click();
      await page.getByTestId("me-password-input").fill(STRONG_PASSWORD);
      await page.getByTestId("me-password-confirm").fill(STRONG_PASSWORD);
      await page.getByTestId("me-password-submit").click();

      await expect(page.getByTestId("me-password-success")).toBeVisible({
        timeout: 15000,
      });
      const section = page.getByTestId("me-password");
      await expect(section).toHaveAttribute("data-has-password", "true");
      await expect(page.getByTestId("me-password-change")).toBeVisible();
      await expect(page.getByTestId("me-password-set")).toHaveCount(0);
      // The expanded form collapses back to the summary.
      await expect(page.getByTestId("me-password-form")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("after setting a password, collector can sign in with email + password", async ({
    browser,
    baseURL,
  }) => {
    await restoreCollectorPassword();
    const setterCtx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      await signInCollector(setterCtx, SEED_COLLECTOR_PASSWORD);
      await clearCollectorPassword();

      const setterPage = await setterCtx.newPage();
      await setterPage.goto("/en/me");
      await setterPage.getByTestId("me-password-set").click();
      await setterPage.getByTestId("me-password-input").fill(STRONG_PASSWORD);
      await setterPage
        .getByTestId("me-password-confirm")
        .fill(STRONG_PASSWORD);
      await setterPage.getByTestId("me-password-submit").click();
      await expect(setterPage.getByTestId("me-password-success")).toBeVisible({
        timeout: 15000,
      });
    } finally {
      await setterCtx.close();
    }

    // Fresh anonymous context — confirm we can sign in via /login with
    // the newly-set password and land on /me.
    const freshCtx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      const page = await freshCtx.newPage();
      await page.goto("/en/login");
      await page.getByTestId("login-email").fill(SEED_COLLECTOR.email);
      await page.getByTestId("login-password").fill(STRONG_PASSWORD);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/en\/me(\?.*)?$/);
      await expect(page.getByTestId("me-dashboard")).toBeVisible();
    } finally {
      await freshCtx.close();
    }
  });

  test("mismatched passwords surface a localized error", async ({
    browser,
    baseURL,
  }) => {
    await restoreCollectorPassword();
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      await signInCollector(ctx, SEED_COLLECTOR_PASSWORD);
      await clearCollectorPassword();

      const page = await ctx.newPage();
      await page.goto("/en/me");
      await page.getByTestId("me-password-set").click();
      await page.getByTestId("me-password-input").fill(STRONG_PASSWORD);
      await page
        .getByTestId("me-password-confirm")
        .fill(`${STRONG_PASSWORD}-x`);
      await page.getByTestId("me-password-submit").click();
      const err = page.getByTestId("me-password-error");
      await expect(err).toBeVisible();
      await expect(err).toHaveAttribute("data-error-code", "mismatch");
      await expect(page.getByTestId("me-password-form")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("weak password (too short) is rejected with the right error code", async ({
    browser,
    baseURL,
  }) => {
    await restoreCollectorPassword();
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      await signInCollector(ctx, SEED_COLLECTOR_PASSWORD);
      await clearCollectorPassword();

      const page = await ctx.newPage();
      await page.goto("/en/me");
      await page.getByTestId("me-password-set").click();
      // Bypass the input element's native minLength so the click reaches
      // the client-side zod check, which is the path we're asserting.
      await page.evaluate(() => {
        document
          .querySelectorAll<HTMLInputElement>(
            'input[name="password"], input[name="confirm_password"]',
          )
          .forEach((el) => el.removeAttribute("minLength"));
      });
      await page.getByTestId("me-password-input").fill("Ab1");
      await page.getByTestId("me-password-confirm").fill("Ab1");
      await page.getByTestId("me-password-submit").click();
      const err = page.getByTestId("me-password-error");
      await expect(err).toBeVisible();
      await expect(err).toHaveAttribute("data-error-code", "tooShort");
    } finally {
      await ctx.close();
    }
  });

  test("weak password (no digit) is rejected with the tooWeak code", async ({
    browser,
    baseURL,
  }) => {
    await restoreCollectorPassword();
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      await signInCollector(ctx, SEED_COLLECTOR_PASSWORD);
      await clearCollectorPassword();

      const page = await ctx.newPage();
      await page.goto("/en/me");
      await page.getByTestId("me-password-set").click();
      // 11 letters, no digit — passes minLength but fails strength.
      await page.getByTestId("me-password-input").fill("onlyletters");
      await page.getByTestId("me-password-confirm").fill("onlyletters");
      await page.getByTestId("me-password-submit").click();
      const err = page.getByTestId("me-password-error");
      await expect(err).toBeVisible();
      await expect(err).toHaveAttribute("data-error-code", "tooWeak");
    } finally {
      await ctx.close();
    }
  });

  test("magic-link sign-in still works for a password-less collector", async ({
    browser,
    baseURL,
  }) => {
    // The point: a collector who never set a password is still fully
    // reachable via the magic-link entry point. In test mode the API
    // skips signInWithOtp and returns the next URL synchronously.
    await restoreCollectorPassword();
    const setupCtx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      // Sign in once to confirm the canonical password works, then
      // clear it so we're asserting the magic-link path against a
      // genuinely password-less user.
      await signInCollector(setupCtx, SEED_COLLECTOR_PASSWORD);
      await clearCollectorPassword();
    } finally {
      await setupCtx.close();
    }

    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL,
    });
    try {
      const res = await ctx.request.post("/api/login/magic-link", {
        data: { email: SEED_COLLECTOR.email, locale: "en" },
      });
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as { ok?: boolean; next?: string };
      expect(body.ok).toBe(true);
      expect(body.next).toBe("/en/me");
    } finally {
      await ctx.close();
    }
  });

  test("admin sees the 'password set ✓' summary + Change button", async ({
    browser,
    baseURL,
  }) => {
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
      // Admins normally land on /admin, but /me works for them too —
      // that's where the password subsection lives.
      await page.goto("/en/me");
      const section = page.getByTestId("me-password");
      await expect(section).toBeVisible();
      await expect(section).toHaveAttribute("data-has-password", "true");
      await expect(page.getByTestId("me-password-change")).toBeVisible();
      await expect(page.getByTestId("me-password-set")).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test("/api/me/password rejects unauthenticated callers with 401", async ({
    request,
  }) => {
    const res = await request.post("/en/api/me/password", {
      data: { password: STRONG_PASSWORD, confirm_password: STRONG_PASSWORD },
    });
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("unauthenticated");
  });

  test("has_password RPC is installed and callable", async () => {
    // Service-role call to confirm the SECURITY DEFINER function is in
    // place. The service-role caller has no auth.uid(), so the function
    // returns false; what matters is that no error surfaces.
    const { error } = await admin().rpc("has_password");
    expect(error).toBeNull();
  });

  test("e2e_clear_user_password is callable by service-role", async () => {
    // Sanity check the migration grants are correct: service_role can
    // invoke the helper without errors. The function-level revoke +
    // grant in the migration locks it down to service-role only, and a
    // misconfigured grant would surface here because seed-remote and
    // tests both depend on the helper.
    const { error } = await admin().rpc("e2e_clear_user_password", {
      p_user_id: SEED_ADMIN_ID,
    });
    expect(error).toBeNull();
    // Restore the admin's password so the afterAll re-mint of
    // ADMIN_STATE_PATH lands a valid session. The clear+restore here
    // revokes every existing admin session, which is why afterAll has
    // to refresh ADMIN_STATE_PATH alongside COLLECTOR_STATE_PATH —
    // otherwise public-header / transfer / piece-specs specs that
    // load the admin storage state run as logged-out and 401.
    const { error: restoreErr } = await admin().auth.admin.updateUserById(
      SEED_ADMIN_ID,
      { password: SEED_ADMIN.password, email_confirm: true },
    );
    expect(restoreErr).toBeNull();
  });
});
