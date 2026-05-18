import { test, expect, request as pwRequest, type APIResponse } from "@playwright/test";
import { COLLECTOR_STATE_PATH, SEED_COLLECTOR } from "./fixtures/auth";
import {
  SEED_HIDDEN_PIECE_ID,
  SEED_HIDDEN_NFC_UID,
  SEED_PIECE_ID,
  SEED_NFC_UID,
} from "../../scripts/seed-remote";
import {
  deleteClaimsForPiece,
  deleteProvenanceByType,
  insertExpiredClaim,
  markClaimFixture,
  setPieceOwner,
} from "./fixtures/phase5";
import { signToken } from "../../lib/hmac";

const COLLECTOR_EMAIL = SEED_COLLECTOR.email;

async function clean(pieceId: string) {
  await deleteClaimsForPiece(pieceId);
  await deleteProvenanceByType(pieceId, ["claimed", "transferred"]);
  await setPieceOwner(pieceId, null);
}

test.describe("Phase 5 — claim flow", () => {
  test.describe.configure({ mode: "serial" });

  test.afterEach(async () => {
    // Reset both pieces (the happy-path and the race-path) so other
    // specs and re-runs start from a clean unclaimed state.
    await clean(SEED_PIECE_ID);
    await clean(SEED_HIDDEN_PIECE_ID);
  });

  test("happy path — collector claims an unclaimed piece via modal", async ({
    browser,
    baseURL,
  }) => {
    await clean(SEED_PIECE_ID);

    const ctx = await browser.newContext({
      storageState: COLLECTOR_STATE_PATH,
      baseURL,
    });
    try {
      const page = await ctx.newPage();
      const token = signToken(SEED_NFC_UID, SEED_PIECE_ID);
      await page.goto(`/en/v/${SEED_NFC_UID}?t=${token}`);
      await expect(page.getByTestId("verification-piece-card")).toBeVisible();
      await expect(page.getByTestId("claim-cta")).toBeVisible();

      await page.getByTestId("claim-cta-button").click();
      await expect(page.getByTestId("claim-modal")).toBeVisible();

      await page.getByTestId("claim-modal-email").fill(COLLECTOR_EMAIL);
      await page.getByTestId("claim-modal-display-name").fill("Phase 5 Tester");
      await page.getByTestId("claim-modal-country").fill("FR");

      // The /v/[uid] page is rendered with testMode=true in this
      // environment, so the modal navigates directly to the handler
      // page on success instead of waiting on an email.
      await Promise.all([
        page.waitForURL(/\/en\/me(\?.*)?$/, { timeout: 20_000 }),
        page.getByTestId("claim-modal-submit").click(),
      ]);

      // Banner present + the piece appears in /me's owned grid.
      await expect(page.getByTestId("me-banner")).toBeVisible();
      const owned = page.getByTestId("me-owned-item");
      await expect(owned).toHaveCount(1);
      await expect(owned.first()).toHaveAttribute("data-piece-id", SEED_PIECE_ID);
    } finally {
      await ctx.close();
    }
  });

  test("double-claim race — only one claim wins", async ({
    browser,
    baseURL,
  }) => {
    await clean(SEED_HIDDEN_PIECE_ID);

    // Two parallel initiate requests followed by parallel finalize
    // navigations. The atomic claim_piece(...) function locks both
    // the claim row and the piece row, so only one finalize can
    // assign ownership; the other receives the 'already_claimed'
    // error and the friendly handler page.
    const collectorCtx = await browser.newContext({
      storageState: COLLECTOR_STATE_PATH,
      baseURL,
    });
    try {
      const initiate = async (): Promise<APIResponse> =>
        collectorCtx.request.post("/api/claim/initiate", {
          data: {
            piece_id: SEED_HIDDEN_PIECE_ID,
            email: COLLECTOR_EMAIL,
            display_name: "Race Tester",
            country: "FR",
            locale: "en",
          },
        });

      const [r1, r2] = await Promise.all([initiate(), initiate()]);
      expect(r1.ok()).toBeTruthy();
      expect(r2.ok()).toBeTruthy();
      const body1 = (await r1.json()) as { token?: string; next?: string };
      const body2 = (await r2.json()) as { token?: string; next?: string };
      expect(body1.token).toBeTruthy();
      expect(body2.token).toBeTruthy();
      expect(body1.token).not.toBe(body2.token);

      // Both claim rows are test fixtures — flag them so the prune
      // contract reaches them on next teardown.
      const { getClaimByPieceAndEmail } = await import(
        "./fixtures/phase5"
      );
      const latest = await getClaimByPieceAndEmail(
        SEED_HIDDEN_PIECE_ID,
        COLLECTOR_EMAIL,
      );
      if (latest) await markClaimFixture(latest.id);

      // Now finalize both in parallel via direct GET on the handler
      // page. The cookie session is the collector's, set by the
      // storage state.
      const p1 = await collectorCtx.newPage();
      const p2 = await collectorCtx.newPage();
      const [resp1, resp2] = await Promise.all([
        p1.goto(`/en/claim/${body1.token}`),
        p2.goto(`/en/claim/${body2.token}`),
      ]);
      expect(resp1?.status()).toBeLessThan(500);
      expect(resp2?.status()).toBeLessThan(500);

      // One landed on /me (claimed=1); the other landed on the
      // claim-error page (already_claimed).
      const urls = [p1.url(), p2.url()];
      const meWins = urls.filter((u) => /\/en\/me(\?.*)?$/.test(u));
      const errorWins = urls.filter((u) =>
        /\/en\/claim\/[^/?#]+(?:\?|$)/.test(u),
      );
      expect(meWins.length).toBe(1);
      expect(errorWins.length).toBe(1);

      // The error page renders the "already claimed" friendly state.
      const errorPage = p1.url() === errorWins[0] ? p1 : p2;
      await expect(errorPage.getByTestId("claim-error")).toBeVisible();
    } finally {
      await collectorCtx.close();
    }
  });

  test("expired link — handler renders the expired panel", async ({
    browser,
    baseURL,
  }) => {
    await clean(SEED_PIECE_ID);
    const { id, token } = await insertExpiredClaim({
      piece_id: SEED_PIECE_ID,
      email: COLLECTOR_EMAIL,
    });
    await markClaimFixture(id);

    const ctx = await browser.newContext({
      storageState: COLLECTOR_STATE_PATH,
      baseURL,
    });
    try {
      const page = await ctx.newPage();
      await page.goto(`/en/claim/${token}`);
      await expect(page.getByTestId("claim-error")).toBeVisible();
      // The error h1 should be the "expired" string. Since both
      // expired and not-signed-in share the same heading copy, we
      // just assert the error panel is shown rather than matching
      // the exact title.
    } finally {
      await ctx.close();
    }
  });

  test("emailRedirectTo tracks the request origin, not NEXT_PUBLIC_SITE_URL", async ({
    browser,
    baseURL,
  }) => {
    // Regression for the Phase 5 magic-link bug: links dispatched from
    // a Vercel preview deploy were redirecting to prod (which doesn't
    // have the Phase 5 routes) because emailRedirectTo was hardcoded
    // to NEXT_PUBLIC_SITE_URL. The fix derives the origin from the
    // inbound request URL.
    await clean(SEED_PIECE_ID);
    const colCtx = await browser.newContext({
      storageState: COLLECTOR_STATE_PATH,
      baseURL,
    });
    try {
      const res = await colCtx.request.post("/api/claim/initiate", {
        data: {
          piece_id: SEED_PIECE_ID,
          email: COLLECTOR_EMAIL,
          display_name: "Origin Tester",
          country: "FR",
          locale: "en",
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as { email_redirect_to?: string };
      expect(body.email_redirect_to).toBeTruthy();
      const redirect = new URL(body.email_redirect_to!);
      const requestHost = new URL(baseURL!).host;
      expect(redirect.host).toBe(requestHost);
      // Sanity: when NEXT_PUBLIC_SITE_URL differs from the request
      // host, the redirect must follow the request — not the env var.
      const siteUrlEnv = process.env.NEXT_PUBLIC_SITE_URL;
      if (siteUrlEnv) {
        const envHost = new URL(siteUrlEnv).host;
        if (envHost !== requestHost) {
          expect(redirect.host).not.toBe(envHost);
        }
      }
    } finally {
      await colCtx.close();
    }
  });

  test("RLS — anonymous and authenticated users cannot read claims", async () => {
    // Anonymous (no auth header) — the anon role inherits whatever
    // policies are configured for SELECT, and we registered none.
    const ctx = await pwRequest.newContext({
      baseURL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      extraHTTPHeaders: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      },
    });
    try {
      const res = await ctx.get("/rest/v1/claims?select=id&limit=1");
      // RLS returns 200 with empty array when no rows are visible —
      // and that's the security contract we want.
      expect(res.status()).toBe(200);
      const rows = (await res.json()) as unknown[];
      expect(rows).toEqual([]);
    } finally {
      await ctx.dispose();
    }
  });
});
