import { test, expect, type APIRequestContext } from "@playwright/test";
import { signToken } from "@/lib/hmac";
import {
  ADMIN_STATE_PATH,
  COLLECTOR_STATE_PATH,
} from "./fixtures/auth";

const SEEDED_PIECE_ID = "00000000-0000-0000-0000-000000000001";
const SEEDED_UID = "04A1B2C3D4E580";

function uniqueUid(prefix: string): string {
  // 14 hex chars, real-looking NTAG215 7-byte UID
  const rand = Math.floor(Math.random() * 0xffff_ffff_ffff)
    .toString(16)
    .toUpperCase()
    .padStart(12, "F");
  return (prefix + rand).slice(0, 14).padEnd(14, "0");
}

// Track every piece a test creates via the admin API so the
// afterEach hook can DELETE it by id. The seed prune is now
// is_fixture-scoped (see scripts/seed-remote.ts) and admin-created
// rows carry is_fixture=false, so they are NOT cleaned up implicitly
// anymore — tests must clean up after themselves.
const createdPieceIds = new Set<string>();

async function cleanupCreated(request: APIRequestContext): Promise<void> {
  const ids = Array.from(createdPieceIds);
  createdPieceIds.clear();
  // Best-effort: a failed delete here shouldn't fail the test suite
  // (the test that created the piece has already passed/failed by now).
  // Errors are reported to the test log for visibility but swallowed.
  await Promise.all(
    ids.map(async (id) => {
      try {
        await request.delete(`/api/admin/pieces/${id}`);
      } catch (e) {
        console.warn(
          `[admin-pieces.spec] cleanup: delete ${id} failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }),
  );
}

test.describe("Phase 2 — admin pieces", () => {
  test.beforeAll(() => {
    if (!process.env.HMAC_SECRET) {
      throw new Error(
        "HMAC_SECRET must be set in .env.local for admin-pieces.spec.ts",
      );
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL must be set for the auth fixture to seed sessions",
      );
    }
  });

  test.describe("admin context", () => {
    test.use({ storageState: ADMIN_STATE_PATH });

    test.afterEach(async ({ request }) => {
      await cleanupCreated(request);
    });

    test("register-then-verify roundtrip", async ({ page, browser }) => {
      // Cold Next compilation of /admin/pieces/new + the redirected
      // /admin/pieces/[id]/edit, plus a remote Supabase round trip, can
      // exceed the default 30 s budget on the first run of a fresh dev
      // server (observed POST 9 s + GET edit 4 s on cold cache).
      test.setTimeout(60_000);
      const uid = uniqueUid("AB");

      // Use a piece_number distinct from canonical seed fixtures
      // (9001/9002/9003 are reserved). 9101 sits inside the test-created
      // band (9100–9899) so the seed prune leaves it alone too.
      await page.goto("/en/admin/pieces/new");
      await page.getByTestId("field-nfc_uid").fill(uid);
      await page.getByTestId("field-character_name").fill("Roundtrip Subject");
      await page.getByTestId("field-piece_number").fill("9101");
      await page.getByTestId("field-sculpt_date").fill("2026-04-01");
      await page.getByTestId("field-paint_date").fill("2026-04-15");
      await page.getByTestId("publish").click();

      await page.waitForURL(/\/admin\/pieces\/([0-9a-f-]+)\/edit/);
      const editUrl = page.url();
      const createdId = editUrl.match(/\/pieces\/([0-9a-f-]+)\/edit/)?.[1];
      if (createdId) createdPieceIds.add(createdId);

      const url = (await page
        .getByTestId("verification-url")
        .textContent())?.trim();
      expect(url).toBeTruthy();
      expect(url).toContain(`/v/${uid.toUpperCase()}`);

      // Visit the verification URL in a fresh, unauthenticated context.
      const anon = await browser.newContext({ storageState: undefined });
      const anonPage = await anon.newPage();
      const path = new URL(url!).pathname + new URL(url!).search;
      const response = await anonPage.goto(path);
      expect(response?.status()).toBe(200);
      await expect(
        anonPage.getByTestId("verification-piece-number"),
      ).toContainText("#9101");
      await anon.close();
    });

    test("photo uploader: real drop event uploads the dropped image", async ({
      page,
      request,
    }) => {
      // Why a real drop event (not the input[type=file] shortcut):
      // we're guarding against a regression where the drop zone forgot to
      // call e.preventDefault() in onDragOver/onDrop, which makes the
      // browser open the dropped file in a new tab instead of uploading.
      // The input fallback would still pass; only a synthesized drop
      // exercises the broken path.
      const uid = uniqueUid("DD");
      const pieceNumber = 9200 + Math.floor(Math.random() * 700);
      const create = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: uid,
          piece_number: pieceNumber,
          edition_number: null,
          edition_total: null,
          character_name: "Drop Target",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
        },
      });
      expect(create.status()).toBe(201);
      const { piece } = (await create.json()) as {
        piece: { id: string };
      };
      createdPieceIds.add(piece.id);

      await page.goto(`/en/admin/pieces/${piece.id}/edit`);
      const dropZone = page.getByTestId("photo-uploader");
      await expect(dropZone).toBeVisible();
      await expect(
        page.locator("[data-testid='photo-uploader'] li img"),
      ).toHaveCount(0);

      // 1×1 transparent PNG. Building a real File in the page context and
      // wiring it through a DataTransfer is the only way to get a Files-typed
      // drag event into React without going through the file input.
      const TINY_PNG_BASE64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      await page.evaluate((base64) => {
        const target = document.querySelector(
          "[data-testid='photo-uploader']",
        );
        if (!target) throw new Error("photo-uploader not found");

        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const file = new File([bytes], "dropped.png", { type: "image/png" });

        const dt = new DataTransfer();
        dt.items.add(file);

        const fire = (type: string) => {
          const ev = new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          });
          target.dispatchEvent(ev);
        };
        fire("dragenter");
        fire("dragover");
        fire("drop");
      }, TINY_PNG_BASE64);

      // After the drop fires, the upload posts to /api/admin/photos and the
      // grid grows by one <img>. If preventDefault was missing on dragover/
      // drop the browser would have navigated to the file URL instead and
      // we'd never see this img.
      await expect(
        page.locator("[data-testid='photo-uploader'] li img"),
      ).toHaveCount(1, { timeout: 15_000 });
      await expect(
        page.getByTestId("photo-uploader-error"),
      ).toBeHidden();
    });

    test("locked uid: UI is disabled on a published piece", async ({ page }) => {
      await page.goto(`/en/admin/pieces/${SEEDED_PIECE_ID}/edit`);
      const uidInput = page.getByTestId("field-nfc_uid");
      await expect(uidInput).toBeDisabled();
      await expect(uidInput).toHaveValue(SEEDED_UID);
    });

    test("locked uid: direct API call to PATCH with new uid is rejected", async ({
      request,
    }) => {
      const res = await request.patch(
        `/api/admin/pieces/${SEEDED_PIECE_ID}`,
        {
          data: { nfc_uid: "ABCDEF0123456789" },
        },
      );
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("uid_locked");
    });

    test("hard delete: end-to-end create -> delete clears DB row + photo storage", async ({
      page,
      request,
    }) => {
      test.setTimeout(60_000);
      const uid = uniqueUid("DE");
      const pieceNumber = 9700 + Math.floor(Math.random() * 200);

      const create = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: uid,
          piece_number: pieceNumber,
          edition_number: null,
          edition_total: null,
          character_name: "Delete Me",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
        },
      });
      expect(create.status()).toBe(201);
      const { piece } = (await create.json()) as { piece: { id: string } };
      createdPieceIds.add(piece.id);

      // Upload one photo so we exercise the photo-folder cleanup path.
      // The piece-photos bucket is public, so the URL is reachable until
      // the storage object is removed.
      const TINY_PNG_BASE64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const png = Buffer.from(TINY_PNG_BASE64, "base64");
      const upload = await request.post("/api/admin/photos", {
        multipart: {
          piece_id: piece.id,
          file: {
            name: "delete-me.png",
            mimeType: "image/png",
            buffer: png,
          },
        },
      });
      expect(upload.status()).toBe(201);
      const { url: photoUrl } = (await upload.json()) as { url: string };

      // Open the edit page, confirm, delete.
      await page.goto(`/en/admin/pieces/${piece.id}/edit`);
      await page.getByTestId("danger-zone-open").click();
      await expect(page.getByTestId("delete-modal")).toBeVisible();
      await page.getByTestId("delete-modal-input").fill(String(pieceNumber));
      await page.getByTestId("delete-modal-confirm").click();

      // Server redirects to the list with ?deleted=NNNN.
      await page.waitForURL(/\/en\/admin\/pieces\?deleted=\d+/);
      const banner = page.getByTestId("piece-deleted-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute(
        "data-piece-number",
        String(pieceNumber),
      );

      // DB row is gone — GET /api/admin/pieces/[id] returns 404.
      const getAfter = await request.get(`/api/admin/pieces/${piece.id}`);
      expect(getAfter.status()).toBe(404);
      // Already deleted by this test — drop from cleanup so afterEach
      // doesn't log a 404 trying to re-delete.
      createdPieceIds.delete(piece.id);

      // The piece-photos bucket folder is cleared. The previously
      // public URL now 404s. Storage caching behaviour can lag for a
      // moment, so allow a single short retry.
      let photoStatus = (await request.get(photoUrl)).status();
      if (photoStatus < 400) {
        await new Promise((r) => setTimeout(r, 800));
        photoStatus = (await request.get(photoUrl)).status();
      }
      expect(photoStatus).toBeGreaterThanOrEqual(400);

      // The list page no longer renders this piece's row.
      await page.goto("/en/admin/pieces?status=all");
      await expect(
        page.locator(`[data-testid="piece-row"]:has-text("#${pieceNumber}")`),
      ).toHaveCount(0);
    });

    test("hard delete modal: wrong piece number keeps confirm disabled", async ({
      page,
      request,
    }) => {
      const uid = uniqueUid("AC");
      const pieceNumber = 9300 + Math.floor(Math.random() * 200);
      const create = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: uid,
          piece_number: pieceNumber,
          edition_number: null,
          edition_total: null,
          character_name: "Modal Subject",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
        },
      });
      expect(create.status()).toBe(201);
      const { piece } = (await create.json()) as { piece: { id: string } };
      createdPieceIds.add(piece.id);

      await page.goto(`/en/admin/pieces/${piece.id}/edit`);
      await page.getByTestId("danger-zone-open").click();

      const input = page.getByTestId("delete-modal-input");
      const confirm = page.getByTestId("delete-modal-confirm");

      // Empty -> disabled.
      await expect(confirm).toBeDisabled();

      // Wrong number -> disabled.
      await input.fill(String(pieceNumber + 1));
      await expect(input).toHaveAttribute("data-matches", "false");
      await expect(confirm).toBeDisabled();

      // Correct number with leading zeros (forgiving normalization).
      await input.fill(`000${pieceNumber}`);
      await expect(input).toHaveAttribute("data-matches", "true");
      await expect(confirm).toBeEnabled();
      // Cleanup handled by afterEach via createdPieceIds.
    });

    test("hard delete modal: cancel closes modal without deleting", async ({
      page,
      request,
    }) => {
      const uid = uniqueUid("AD");
      const pieceNumber = 9500 + Math.floor(Math.random() * 200);
      const create = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: uid,
          piece_number: pieceNumber,
          edition_number: null,
          edition_total: null,
          character_name: "Cancel Subject",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
        },
      });
      expect(create.status()).toBe(201);
      const { piece } = (await create.json()) as { piece: { id: string } };
      createdPieceIds.add(piece.id);

      await page.goto(`/en/admin/pieces/${piece.id}/edit`);
      await page.getByTestId("danger-zone-open").click();
      await page.getByTestId("delete-modal-input").fill(String(pieceNumber));
      await page.getByTestId("delete-modal-cancel").click();
      await expect(page.getByTestId("delete-modal")).toHaveCount(0);

      // The piece is still there.
      const stillThere = await request.get(`/api/admin/pieces/${piece.id}`);
      expect(stillThere.status()).toBe(200);
      // Cleanup handled by afterEach via createdPieceIds.
    });

    test("is_fixture in admin payload is silently stripped (data-safety guard)", async ({
      request,
    }) => {
      // Defense-in-depth check on the data-safety contract: is_fixture is
      // an internal seed-only flag (see scripts/seed-remote.ts and
      // CLAUDE.md "Data safety"). Even if a caller passes is_fixture=true
      // to POST /api/admin/pieces, the row must come back is_fixture=false
      // — the zod schema strips unknown keys and createPiece never reads
      // the field. This guarantees the seed-prune scope can never reach
      // any piece an admin creates through the UI or API.
      const uid = uniqueUid("BE");
      const pieceNumber = 9450 + Math.floor(Math.random() * 50);
      const create = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: uid,
          piece_number: pieceNumber,
          edition_number: null,
          edition_total: null,
          character_name: "Fixture Probe",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
          // The hostile field — must be silently dropped.
          is_fixture: true,
        },
      });
      expect(create.status()).toBe(201);
      const { piece } = (await create.json()) as {
        piece: { id: string; is_fixture: boolean };
      };
      createdPieceIds.add(piece.id);
      expect(piece.is_fixture).toBe(false);

      // Same check on the PATCH path — is_fixture in an update payload
      // must not flip the flag either.
      const patch = await request.patch(`/api/admin/pieces/${piece.id}`, {
        data: { is_fixture: true, character_name: "Fixture Probe Edited" },
      });
      expect(patch.ok()).toBeTruthy();
      const { piece: patched } = (await patch.json()) as {
        piece: { is_fixture: boolean; character_name: string };
      };
      expect(patched.is_fixture).toBe(false);
      expect(patched.character_name).toBe("Fixture Probe Edited");
    });

    test("nfc uid uniqueness rejected at insert", async ({ request }) => {
      // Use the seeded UID in a new piece insert — must collide.
      const res = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: SEEDED_UID,
          piece_number: 9999,
          edition_number: null,
          edition_total: null,
          character_name: "Should not save",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
        },
      });
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("duplicate");
      expect(body.fields?.nfc_uid).toBeTruthy();
    });
  });

  test.describe("non-admin context", () => {
    test.use({ storageState: COLLECTOR_STATE_PATH });

    test("non-admin POST /api/admin/pieces is rejected with 403", async ({
      request,
    }) => {
      const res = await request.post("/api/admin/pieces", {
        data: {
          nfc_uid: uniqueUid("CD"),
          piece_number: 9100,
          edition_number: null,
          edition_total: null,
          character_name: "Should be blocked",
          character_quote: null,
          license_status: "original",
          license_notes: null,
          sculpt_date: "2026-04-01",
          paint_date: "2026-04-15",
          photos: [],
          status: "draft",
        },
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("forbidden");
    });

    test("non-admin reaching /admin/pieces is redirected to /me", async ({
      page,
    }) => {
      await page.goto("/en/admin/pieces");
      // The admin gate now bounces authenticated non-admins to their
      // own dashboard with an informational banner instead of dumping
      // them at /login.
      await page.waitForURL(/\/en\/me\?admin_only=1$/);
      const banner = page.getByTestId("me-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute("data-banner-code", "admin_only");
    });

    test("non-admin DELETE /api/admin/pieces/[id] is rejected with 403", async ({
      request,
    }) => {
      // Hit the seeded piece — it should not be touched (the guard
      // rejects before any deletion happens), and the 403 confirms
      // the gate is enforced server-side, not just in the modal UI.
      const res = await request.delete(`/api/admin/pieces/${SEEDED_PIECE_ID}`);
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("forbidden");
    });
  });

  // Phase 1 verification spec parity check — keeps the public path covered
  // alongside the new admin paths.
  test("seeded piece still verifies with a freshly signed token", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    const token = signToken(SEEDED_UID, SEEDED_PIECE_ID);
    const res = await page.goto(`/en/v/${SEEDED_UID}?t=${token}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("verification-piece-number")).toContainText(
      "#9001",
    );
    await ctx.close();
  });
});
