import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateProfile, ProfileServerError } from "@/lib/server/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /[locale]/api/me/profile { display_name?, country? }
 *
 * Authenticated self-update. Goes through `updateProfile` which uses
 * the service-role client to satisfy the `profiles_update_self` RLS
 * policy without round-tripping the cookie session a second time.
 *
 * Empty strings are normalized to NULL so a user can clear a field.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const profile = await updateProfile(user.id, body);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    if (e instanceof ProfileServerError) {
      return NextResponse.json(
        { error: e.code, fields: e.fields },
        { status: e.status },
      );
    }
    throw e;
  }
}
