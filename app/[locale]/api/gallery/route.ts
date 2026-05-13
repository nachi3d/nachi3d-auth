import { NextRequest, NextResponse } from "next/server";
import { isLocale } from "@/i18n/routing";
import {
  GALLERY_PAGE_SIZE,
  listGalleryCards,
  parseLicenseFilter,
} from "@/lib/server/gallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ locale: string }>;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { locale } = await ctx.params;
  if (!isLocale(locale)) {
    return NextResponse.json({ error: "invalid_locale" }, { status: 404 });
  }

  const url = new URL(req.url);
  const pageRaw = url.searchParams.get("page");
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const license = parseLicenseFilter(
    url.searchParams.get("license") ?? undefined,
  );

  try {
    const result = await listGalleryCards({
      page,
      pageSize: GALLERY_PAGE_SIZE,
      license,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: "server_error", message: e instanceof Error ? e.message : "?" },
      { status: 500 },
    );
  }
}
