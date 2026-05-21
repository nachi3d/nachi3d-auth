import { NextRequest, NextResponse } from "next/server";
import { clearUserPasswordForTest } from "@/lib/server/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Test-only password-clear endpoint. Disabled in production builds —
 * guarded by `E2E_TEST_LOGIN_ENABLED`, which the Playwright config
 * sets on the dev server it spawns. Mirrors `/api/test/signin`.
 *
 * The Supabase JS admin API cannot null an existing
 * `auth.users.encrypted_password`, so this route delegates to the
 * `public.e2e_clear_user_password` SECURITY DEFINER RPC granted only
 * to `service_role`. Used by tests/e2e/password.spec.ts to land the
 * collector in the "no password yet" state before exercising the
 * /me password subsection.
 *
 * POST /api/test/clear-password { user_id }
 */
export async function POST(req: NextRequest) {
  if (process.env.E2E_TEST_LOGIN_ENABLED !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.user_id || typeof body.user_id !== "string") {
    return NextResponse.json(
      { error: "validation_error" },
      { status: 400 },
    );
  }

  await clearUserPasswordForTest(body.user_id);
  return NextResponse.json({ ok: true });
}
