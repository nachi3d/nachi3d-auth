import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/hmac";
import { TamperPanel } from "@/components/verification/TamperPanel";
import { NotFoundPanel } from "@/components/verification/NotFoundPanel";
import { PieceCard } from "@/components/verification/PieceCard";

export const dynamic = "force-dynamic";

interface VerifyPageProps {
  params: Promise<{ locale: string; uid: string }>;
  searchParams: Promise<{ t?: string }>;
}

export default async function VerifyPage({
  params,
  searchParams,
}: VerifyPageProps) {
  const { locale, uid } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const { t: token } = await searchParams;
  const t = await getTranslations("verify");
  const supabase = createAdminClient();

  const { data: piece, error } = await supabase
    .from("pieces")
    .select(
      "id, piece_number, edition_number, edition_total, nfc_uid, character_name, character_quote, sculpt_date, paint_date, photos, status",
    )
    .eq("nfc_uid", uid)
    .eq("status", "published")
    .maybeSingle();

  if (error || !piece) {
    return <NotFoundPanel title={t("notFoundTitle")} body={t("notFoundBody")} />;
  }

  const tokenValid =
    typeof token === "string" && verifyToken(piece.nfc_uid, piece.id, token);

  if (!tokenValid) {
    return (
      <TamperPanel title={t("tamperTitle")} body={t("tamperBody")} />
    );
  }

  // Log the verification (best-effort; never blocks the response).
  void recordVerification(piece.id);

  return (
    <PieceCard
      piece={piece}
      labels={{
        pieceNumber: t("pieceNumber"),
        character: t("character"),
        sculptDate: t("sculptDate"),
        paintDate: t("paintDate"),
        authenticated: t("authenticated"),
        edition:
          piece.edition_number !== null && piece.edition_total !== null
            ? t("edition", {
                n: piece.edition_number,
                total: piece.edition_total,
              })
            : null,
      }}
      locale={locale}
    />
  );
}

async function recordVerification(pieceId: string): Promise<void> {
  try {
    const h = await headers();
    const supabase = createAdminClient();
    await supabase.from("verification_logs").insert({
      piece_id: pieceId,
      ip_country: h.get("cf-ipcountry"),
      ip_region: h.get("cf-region") ?? h.get("cf-ipcity"),
      user_agent: h.get("user-agent"),
      is_owner: false,
    });
  } catch {
    // Logging is best-effort; never surface failures to the verifier.
  }
}
