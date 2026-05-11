import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Test-only signin endpoint. Disabled in production builds — guarded by
 * the E2E_TEST_LOGIN_ENABLED env flag, which the Playwright config sets
 * on the dev server it spawns. NEVER enable this in production.
 *
 * POST /api/test/signin { email, password }
 *   Calls supabase.auth.signInWithPassword and lets @supabase/ssr write
 *   the auth cookies via the standard cookie machinery. Returns 200 on
 *   success; 404 when the gate is off; 401 on bad credentials.
 */
export async function POST(req: NextRequest) {
  if (process.env.E2E_TEST_LOGIN_ENABLED !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: "validation_error" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });

  if (error || !data.session) {
    return NextResponse.json(
      { error: "unauthorized", message: error?.message },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true, user: { id: data.user.id } });
}
