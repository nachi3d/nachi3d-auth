import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/i18n/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /[locale]/api/me/signout — owner-facing logout. Mirrors the
 * admin logoutAction: signs out the local cookie session and bounces
 * the user back to the landing page.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const target = new URL(`/${locale}`, req.nextUrl.origin);
  return NextResponse.redirect(target, { status: 303 });
}
