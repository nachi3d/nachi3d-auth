import { test, expect, request as pwRequest } from "@playwright/test";
import {
  ADMIN_STATE_PATH,
  COLLECTOR_STATE_PATH,
  SEED_ADMIN,
  SEED_COLLECTOR,
} from "./fixtures/auth";
import {
  SEED_ADMIN_ID,
  SEED_COLLECTOR_ID,
  SEED_PIECE_ID,
} from "../../scripts/seed-remote";
import {
  deleteProvenanceByType,
  deleteTransfersForPiece,
  forceTransferExpired,
  getTransfersForPiece,
  markTransferFixture,
  setPieceOwner,
} from "./fixtures/phase5";

async function resetPiece() {
  await deleteTransfersForPiece(SEED_PIECE_ID);
  await deleteProvenanceByType(SEED_PIECE_ID, ["transferred"]);
}

test.describe("Phase 5 — transfer flow", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async () => {
    // Collector owns SEED_PIECE for every test in this spec; afterEach
    // wipes any transfer rows + the ownership.
    await resetPiece();
    await setPieceOwner(SEED_PIECE_ID, SEED_COLLECTOR_ID);
  });

  test.afterEach(async () => {
    await resetPiece();
    await setPieceOwner(SEED_PIECE_ID, null);
  });

  test("happy path — collector → admin transfer is initiated, accepted, ownership flips", async ({
    browser,
    baseURL,
  }) => {
    // 1) Collector initiates a transfer to the admin's email.
    const colCtx = await browser.newContext({
      storageState: COLLECTOR_STATE_PATH,
      baseURL,
    });
    let nextUrl = "";
    let transferToken = "";
    try {
      const res = await colCtx.request.post("/api/transfer/initiate", {
        data: {
          piece_id: SEED_PIECE_ID,
          to_email: SEED_ADMIN.email,
          note: "Heading your way.",
          locale: "en",
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as {
        ok: boolean;
        token: string;
        next: string;
        transfer_id: string;
      };
      expect(body.ok).toBe(true);
      transferToken = body.token;
      nextUrl = body.next;
      await markTransferFixture(body.transfer_id);
    } finally {
      await colCtx.close();
    }

    // 2) Admin (a separate context) opens the transfer handler URL
    //    and accepts.
    const adminCtx = await browser.newContext({
      storageState: ADMIN_STATE_PATH,
      baseURL,
    });
    try {
      const page = await adminCtx.newPage();
      await page.goto(nextUrl);
      await expect(page.getByTestId("transfer-handler")).toBeVisible();
      await expect(page.getByTestId("transfer-preview")).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/en\/me(\?.*)?$/, { timeout: 20_000 }),
        page.getByTestId("transfer-accept-button").click(),
      ]);
      await expect(page.getByTestId("me-banner")).toBeVisible();
      await expect(page.getByTestId("me-owned-item")).toHaveCount(1);
      await expect(page.getByTestId("me-owned-item").first()).toHaveAttribute(
        "data-piece-id",
        SEED_PIECE_ID,
      );
    } finally {
      await adminCtx.close();
    }

    // 3) After acceptance, the transfer row is status='accepted'.
    const after = await getTransfersForPiece(SEED_PIECE_ID);
    expect(after.length).toBe(1);
    expect(after[0]?.status).toBe("accepted");
    // And the piece is owned by the admin now — reset for afterEach.
    await setPieceOwner(SEED_PIECE_ID, SEED_COLLECTOR_ID);
    // also reuse the token to verify second-accept is rejected
    const adminCtx2 = await browser.newContext({
      storageState: ADMIN_STATE_PATH,
      baseURL,
    });
    try {
      const r = await adminCtx2.request.post("/api/transfer/accept", {
        data: { token: transferToken },
      });
      expect(r.status()).toBe(409);
    } finally {
      await adminCtx2.close();
    }
  });

  test("revoke before accept — accept then 409s", async ({
    browser,
    baseURL,
  }) => {
    const colCtx = await browser.newContext({
      storageState: COLLECTOR_STATE_PATH,
      baseURL,
    });
    let transferId = "";
    let token = "";
    try {
      const r = await colCtx.request.post("/api/transfer/initiate", {
        data: {
          piece_id: SEED_PIECE_ID,
          to_email: SEED_ADMIN.email,
          locale: "en",
        },
      });
      expect(r.ok()).toBeTruthy();
      const body = (await r.json()) as { transfer_id: string; token: string };
      transferId = body.transfer_id;
      token = body.token;
      await markTransferFixture(transferId);

      // Revoke immediately.
      const revoke = await colCtx.request.post("/api/transfer/revoke", {
        data: { transfer_id: transferId },
      });
      expect(revoke.ok()).toBeTruthy();
    } finally {
      await colCtx.close();
    }

    // Verify accept now fails with 409.
    const adminCtx = await browser.newContext({
      storageState: ADMIN_STATE_PATH,
      baseURL,
    });
    try {
      const r = await adminCtx.request.post("/api/transfer/accept", {
        data: { token },
      });
      expect(r.status()).toBe(409);
      const body = (await r.json()) as { error: string };
      expect(body.error).toBe("revoked");
    } finally {
      await adminCtx.close();
    }

    const rows = await getTransfersForPiece(SEED_PIECE_ID);
    expect(rows[0]?.status).toBe("revoked");
  });

  test("expiry — past-expiry accept is rejected and row flips to expired", async ({
    browser,
    baseURL,
  }) => {
    const colCtx = await browser.newContext({
      storageState: COLLECTOR_STATE_PATH,
      baseURL,
    });
    let transferId = "";
    let token = "";
    try {
      const r = await colCtx.request.post("/api/transfer/initiate", {
        data: {
          piece_id: SEED_PIECE_ID,
          to_email: SEED_ADMIN.email,
          locale: "en",
        },
      });
      const body = (await r.json()) as { transfer_id: string; token: string };
      transferId = body.transfer_id;
      token = body.token;
      await markTransferFixture(transferId);
      // Force the row into the past.
      await forceTransferExpired(transferId);
    } finally {
      await colCtx.close();
    }

    const adminCtx = await browser.newContext({
      storageState: ADMIN_STATE_PATH,
      baseURL,
    });
    try {
      const r = await adminCtx.request.post("/api/transfer/accept", {
        data: { token },
      });
      expect(r.status()).toBe(409);
      const body = (await r.json()) as { error: string };
      expect(body.error).toBe("expired");
    } finally {
      await adminCtx.close();
    }

    const rows = await getTransfersForPiece(SEED_PIECE_ID);
    expect(rows[0]?.status).toBe("expired");
  });

  test("self-transfer is rejected", async ({ browser, baseURL }) => {
    const colCtx = await browser.newContext({
      storageState: COLLECTOR_STATE_PATH,
      baseURL,
    });
    try {
      const r = await colCtx.request.post("/api/transfer/initiate", {
        data: {
          piece_id: SEED_PIECE_ID,
          to_email: SEED_COLLECTOR.email,
          locale: "en",
        },
      });
      expect(r.status()).toBe(400);
      const body = (await r.json()) as { error: string };
      expect(body.error).toBe("self_transfer");
    } finally {
      await colCtx.close();
    }
  });

  test("not-owner cannot initiate transfer", async ({ browser, baseURL }) => {
    // Admin is not the current owner of SEED_PIECE (collector is, per
    // beforeEach). The admin is_admin status doesn't grant transfer
    // rights — only the current owner can transfer.
    const adminCtx = await browser.newContext({
      storageState: ADMIN_STATE_PATH,
      baseURL,
    });
    try {
      const r = await adminCtx.request.post("/api/transfer/initiate", {
        data: {
          piece_id: SEED_PIECE_ID,
          to_email: "stranger@nachi3d.test",
          locale: "en",
        },
      });
      expect(r.status()).toBe(403);
    } finally {
      await adminCtx.close();
    }
  });

  test("emailRedirectTo tracks the request origin, not NEXT_PUBLIC_SITE_URL", async ({
    browser,
    baseURL,
  }) => {
    // Regression for the Phase 5 magic-link bug: see the matching
    // test in claim.spec.ts for the full motivation.
    const colCtx = await browser.newContext({
      storageState: COLLECTOR_STATE_PATH,
      baseURL,
    });
    try {
      const r = await colCtx.request.post("/api/transfer/initiate", {
        data: {
          piece_id: SEED_PIECE_ID,
          to_email: SEED_ADMIN.email,
          locale: "en",
        },
      });
      expect(r.ok()).toBeTruthy();
      const body = (await r.json()) as {
        transfer_id: string;
        email_redirect_to?: string;
      };
      await markTransferFixture(body.transfer_id);
      expect(body.email_redirect_to).toBeTruthy();
      const redirect = new URL(body.email_redirect_to!);
      const requestHost = new URL(baseURL!).host;
      expect(redirect.host).toBe(requestHost);
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

  test("RLS — non-owner cannot read transfers via REST", async ({
    browser,
    baseURL,
  }) => {
    // Set up a pending transfer collector → admin, then verify a third
    // party (a totally unauthenticated request) cannot SELECT it.
    const colCtx = await browser.newContext({
      storageState: COLLECTOR_STATE_PATH,
      baseURL,
    });
    try {
      const r = await colCtx.request.post("/api/transfer/initiate", {
        data: {
          piece_id: SEED_PIECE_ID,
          to_email: SEED_ADMIN.email,
          locale: "en",
        },
      });
      const body = (await r.json()) as { transfer_id: string };
      await markTransferFixture(body.transfer_id);
    } finally {
      await colCtx.close();
    }

    const restCtx = await pwRequest.newContext({
      baseURL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      extraHTTPHeaders: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      },
    });
    try {
      const res = await restCtx.get(
        `/rest/v1/transfers?select=id&piece_id=eq.${SEED_PIECE_ID}`,
      );
      expect(res.status()).toBe(200);
      const rows = (await res.json()) as unknown[];
      expect(rows).toEqual([]);
    } finally {
      await restCtx.dispose();
    }
    // Quiet the unused-var warnings.
    void SEED_ADMIN_ID;
  });
});
