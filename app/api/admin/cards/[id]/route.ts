import { NextRequest, NextResponse } from "next/server";
import {
  AdminGuardError,
  adminGuardStatus,
  requireAdmin,
} from "@/lib/auth/admin-guard";
import {
  getCachedCardPdf,
  getPieceById,
  PieceServerError,
  putCardPdf,
} from "@/lib/server/pieces";
import { generateCardPdf } from "@/lib/pdf/card-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

const AUTH_NOTICES = {
  en: "This card certifies the authenticity of a Nachi3D figurine. Tap the embedded NFC chip with any smartphone, or scan the QR code on the front, to view the verification page on verify.nachi3d.com.",
  fr: "Cette carte certifie l'authenticité d'une figurine Nachi3D. Approchez la puce NFC intégrée d'un smartphone, ou scannez le QR code au recto, pour consulter la page de vérification sur verify.nachi3d.com.",
  ar: "تشهد هذه البطاقة على أصالة قطعة Nachi3D. قرّب شريحة NFC المدمجة من أي هاتف ذكي، أو امسح رمز QR الموجود في الواجهة، لعرض صفحة التحقق على verify.nachi3d.com.",
  supportEmail: "Questions? hello@nachi3d.com",
};

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminGuardError) {
      return NextResponse.json(
        { error: e.reason },
        { status: adminGuardStatus(e.reason) },
      );
    }
    throw e;
  }

  const { id } = await ctx.params;

  let piece;
  try {
    piece = await getPieceById(id);
  } catch (e) {
    if (e instanceof PieceServerError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: e.status },
      );
    }
    throw e;
  }
  if (!piece) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const filename = `nachi3d-certify-piece-${piece.piece_number
    .toString()
    .padStart(4, "0")}.pdf`;

  // Cache hit?
  const cached = await getCachedCardPdf(id);
  if (cached) {
    return new NextResponse(toResponseBody(cached), {
      status: 200,
      headers: pdfHeaders(filename, "HIT"),
    });
  }

  // Generate fresh
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const bytes = await generateCardPdf({
    piece,
    siteUrl,
    notices: AUTH_NOTICES,
  });

  try {
    await putCardPdf(id, bytes);
  } catch {
    // Caching is best-effort; serve the freshly-generated PDF even if the
    // upload fails.
  }

  return new NextResponse(toResponseBody(bytes), {
    status: 200,
    headers: pdfHeaders(filename, "MISS"),
  });
}

function pdfHeaders(filename: string, cache: "HIT" | "MISS"): HeadersInit {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "X-Cache": cache,
    "Cache-Control": "private, max-age=0, must-revalidate",
  };
}

function toResponseBody(bytes: Uint8Array): BodyInit {
  // Convert Uint8Array to a fresh ArrayBuffer slice that satisfies BodyInit.
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
