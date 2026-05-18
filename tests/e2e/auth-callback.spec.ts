import { test, expect } from "@playwright/test";

test.describe("Phase 5 — /auth/callback reachability", () => {
  test("magic-link callback is reachable without a locale prefix", async ({
    request,
  }) => {
    // Regression: localePrefix:'always' in next-intl routing was
    // catching /auth/callback and redirecting it to /<locale>/auth/callback,
    // which had no matching route file and 404'd on the preview deploy.
    // The middleware matcher now excludes `auth`, so /auth/callback hits
    // app/auth/callback/route.ts directly.
    //
    // No `code` param → the handler short-circuits and 307s to `next`.
    // The asserts that matter are: (a) it isn't a 404, and (b) the
    // redirect Location doesn't bounce back into /<locale>/auth/callback.
    const res = await request.get("/auth/callback?next=/en", {
      maxRedirects: 0,
    });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    const location = res.headers()["location"];
    expect(location, "callback must set a Location header").toBeTruthy();
    expect(location).not.toMatch(/\/(en|fr|ar)\/auth\/callback/);
    expect(location).toMatch(/\/en(\?|$|\/)/);
  });

  test("magic-link callback with a bogus code falls back to /en/login", async ({
    request,
  }) => {
    // A fake code makes exchangeCodeForSession fail; the handler
    // redirects to /en/login?error=magic_link_failed. This proves the
    // handler is actually executing (not 404'd by the middleware
    // localePrefix redirect).
    const res = await request.get(
      "/auth/callback?code=not-a-real-code&next=/en",
      { maxRedirects: 0 },
    );
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    const location = res.headers()["location"];
    expect(location).toBeTruthy();
    expect(location).toMatch(/\/en\/login\?.*error=magic_link_failed/);
  });
});
