import { test, expect } from "@playwright/test";
import { signToken } from "@/lib/hmac";
import {
  ADMIN_STATE_PATH,
  COLLECTOR_STATE_PATH,
  SEED_COLLECTOR,
  ensureSignedInState,
} from "./fixtures/auth";
import { SEED_PIECE_ID, SEED_NFC_UID } from "../../scripts/seed-remote";

// Phase 5-prep: PublicHeader is the persistent auth affordance on every
// public surface. These specs lock in:
//   1. presence rules per route (renders on public surfaces only)
//   2. unauth ⇄ auth state swap
//   3. dropdown behaviour (open, item navigation, sign-out)
//   4. RTL anchoring on /ar
//
// Tamper, /admin, and /login are explicit absentees — covered as
// negative cases so a regression that mounts the header on those
// surfaces fails loudly.

test.describe("PublicHeader — unauthenticated", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows login link on /fr/gallery, click lands on /fr/login", async ({
    page,
  }) => {
    await page.goto("/fr/gallery");
    const login = page.getByTestId("public-header-login");
    await expect(login).toBeVisible();
    await expect(login).toHaveText(/Connexion/);
    await login.click();
    await expect(page).toHaveURL(/\/fr\/login$/);
  });

  test("shows login link on /fr/v/[uid] happy path", async ({ page }) => {
    const token = signToken(SEED_NFC_UID, SEED_PIECE_ID);
    await page.goto(`/fr/v/${SEED_NFC_UID}?t=${token}`);
    await expect(page.getByTestId("public-header-login")).toBeVisible();
  });

  test("header absent on tamper panel (/fr/v/[uid] with bad token)", async ({
    page,
  }) => {
    await page.goto(`/fr/v/${SEED_NFC_UID}?t=not-a-real-token`);
    await expect(page.getByTestId("verification-piece-card")).toHaveCount(0);
    await expect(page.getByTestId("public-header-login")).toHaveCount(0);
    await expect(page.getByTestId("public-header-user")).toHaveCount(0);
  });

  test("header absent on /fr/login", async ({ page }) => {
    await page.goto("/fr/login");
    await expect(page.getByTestId("login-card")).toBeVisible();
    await expect(page.getByTestId("public-header-login")).toHaveCount(0);
    await expect(page.getByTestId("public-header-user")).toHaveCount(0);
  });
});

test.describe("PublicHeader — authenticated (collector)", () => {
  test.use({ storageState: COLLECTOR_STATE_PATH });

  // The sign-out test below invokes supabase.auth.signOut({ scope:
  // "local" }), which — despite the "local" wording — also revokes the
  // current refresh token server-side. That leaves the on-disk
  // COLLECTOR_STATE_PATH pointing at a session whose refresh_token is
  // dead, breaking transfer.spec.ts (next alphabetically). Re-seed the
  // collector's storage state after this spec so downstream specs
  // start from a fresh session.
  test.afterAll(async ({}, testInfo) => {
    const baseURL =
      testInfo.project.use.baseURL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;
    await ensureSignedInState(SEED_COLLECTOR, COLLECTOR_STATE_PATH, baseURL);
  });

  test("shows user cluster on /fr/gallery with initials + name", async ({
    page,
  }) => {
    await page.goto("/fr/gallery");
    const cluster = page.getByTestId("public-header-user");
    await expect(cluster).toBeVisible();
    // Login link must be gone in the authed state.
    await expect(page.getByTestId("public-header-login")).toHaveCount(0);
    // Avatar single-character initial, label has the display name.
    const avatar = page.getByTestId("public-header-avatar");
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveText(/^.$/);
    await expect(page.getByTestId("public-header-label")).toContainText(
      /Test Collector|collector/,
    );
  });

  test("clicking cluster opens dropdown with My Pieces + Sign out", async ({
    page,
  }) => {
    await page.goto("/fr/gallery");
    await page.getByTestId("public-header-trigger").click();
    const menu = page.getByTestId("public-header-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("role", "menu");
    const myPieces = page.getByTestId("public-header-menu-my-pieces");
    const signOut = page.getByTestId("public-header-menu-sign-out");
    await expect(myPieces).toHaveText(/Mes pièces/);
    await expect(signOut).toHaveText(/Se déconnecter/);
    await expect(myPieces).toHaveAttribute("role", "menuitem");
    await expect(signOut).toHaveAttribute("role", "menuitem");
  });

  test("clicking My Pieces navigates to /fr/me", async ({ page }) => {
    await page.goto("/fr/gallery");
    await page.getByTestId("public-header-trigger").click();
    await page.getByTestId("public-header-menu-my-pieces").click();
    await expect(page).toHaveURL(/\/fr\/me$/);
  });

  test("Esc closes the dropdown", async ({ page }) => {
    await page.goto("/fr/gallery");
    await page.getByTestId("public-header-trigger").click();
    await expect(page.getByTestId("public-header-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("public-header-menu")).toHaveCount(0);
  });

  test("clicking Sign out clears the session and reverts to login link", async ({
    page,
  }) => {
    await page.goto("/fr/gallery");
    await page.getByTestId("public-header-trigger").click();
    await page.getByTestId("public-header-menu-sign-out").click();
    // Action redirects to /fr (the locale root). Verify we land on a
    // public surface that is now showing the unauthed header.
    await expect(page).toHaveURL(/\/fr\/?$/);
    await expect(page.getByTestId("public-header-login")).toBeVisible();
    await expect(page.getByTestId("public-header-user")).toHaveCount(0);
  });
});

test.describe("PublicHeader — admin surfaces", () => {
  test.use({ storageState: ADMIN_STATE_PATH });

  test("header absent on /fr/admin (admin top bar handles auth instead)", async ({
    page,
  }) => {
    await page.goto("/fr/admin");
    await expect(page.getByTestId("admin-topbar")).toBeVisible();
    await expect(page.getByTestId("public-header-login")).toHaveCount(0);
    await expect(page.getByTestId("public-header-user")).toHaveCount(0);
  });
});

test.describe("PublicHeader — RTL on /ar", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("html dir is rtl and login link is reachable", async ({ page }) => {
    await page.goto("/ar/gallery");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const login = page.getByTestId("public-header-login");
    await expect(login).toBeVisible();
    await expect(login).toHaveText(/تسجيل الدخول/);
  });
});
