import { NextRequest, NextResponse } from "next/server";
import { setUserPassword, PasswordServerError } from "@/lib/server/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /[locale]/api/me/password { password, confirm_password }
 *
 * Sets (or rotates) the authenticated user's password. The session
 * cookie is the sole proof of identity — no `current_password`
 * challenge because the user is already authenticated by the cookie
 * and the magic-link recovery path stays available either way.
 *
 * Rate limiting is delegated to Supabase Auth (server-side, per-user).
 * The route validates first, calls `supabase.auth.updateUser`, then
 * returns `{ ok: true }` so the client can flip to the
 * "Mot de passe défini ✓" summary state.
 *
 * No password value is ever logged — only the upstream error message
 * (never the supplied password).
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    await setUserPassword(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PasswordServerError) {
      return NextResponse.json(
        { error: e.code, field: e.fieldCode },
        { status: e.status },
      );
    }
    throw e;
  }
}
