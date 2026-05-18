import { notFound, redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import {
  getProfileById,
  listOwnedPieces,
} from "@/lib/server/profiles";
import {
  expirePendingTransfers,
  listTransfersForOwner,
} from "@/lib/server/transfers";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { OwnerDashboard } from "@/components/owner/OwnerDashboard";
import { signToken } from "@/lib/hmac";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    claimed?: string;
    transfer_accepted?: string;
    transfer_sent?: string;
    transfer_revoked?: string;
    profile_saved?: string;
  }>;
}

export default async function MePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Lazy expiry — keeps /me consistent even when pg_cron isn't
  // running (free-tier Supabase requires it to be enabled in the
  // dashboard; the migration logs a notice and skips scheduling if
  // the extension isn't installed).
  await expirePendingTransfers();

  const sp = await searchParams;
  const banner =
    sp.claimed === "1"
      ? ("claimed" as const)
      : sp.transfer_accepted === "1"
        ? ("transfer_accepted" as const)
        : sp.transfer_sent === "1"
          ? ("transfer_sent" as const)
          : sp.transfer_revoked === "1"
            ? ("transfer_revoked" as const)
            : sp.profile_saved === "1"
              ? ("profile_saved" as const)
              : null;

  const [profile, pieces, transfers] = await Promise.all([
    getProfileById(user.id),
    listOwnedPieces(user.id),
    listTransfersForOwner(user.id),
  ]);

  const t = await getTranslations("me");
  const tNav = await getTranslations("nav");
  const tStatus = await getTranslations("me.transferStatus");

  // Pre-compute verification URLs (HMAC tokens) for each owned piece
  // so the dashboard can link straight to /v/[uid]?t=... without
  // exposing the hmac helper to the client bundle.
  const tOwned = await getTranslations("me.owned");
  const tHistory = await getTranslations("me.history");

  const owned = pieces.map((p) => ({
    id: p.id,
    piece_number: p.piece_number,
    character_name: p.character_name,
    nfc_uid: p.nfc_uid,
    photos: p.photos,
    verification_url: `/${locale}/v/${p.nfc_uid}?t=${signToken(p.nfc_uid, p.id)}`,
    piece_label: tOwned("pieceNumber", {
      number: String(p.piece_number).padStart(4, "0"),
    }),
  }));

  return (
    <>
      <OwnerDashboard
        locale={locale}
        profile={{
          display_name: profile?.display_name ?? "",
          country: profile?.country ?? "",
        }}
        owned={owned}
        transfers={transfers.map((row) => ({
          id: row.id,
          piece_id: row.piece_id,
          piece_label:
            row.piece?.piece_number !== undefined &&
            row.piece?.piece_number !== null
              ? tHistory("piece", {
                  number: String(row.piece.piece_number).padStart(4, "0"),
                })
              : "—",
          character_name: row.piece?.character_name ?? null,
          from_owner_id: row.from_owner_id,
          to_email: row.to_email,
          status: row.status,
          created_at: row.created_at,
          expires_at: row.expires_at,
          accepted_at: row.accepted_at,
          note: row.note,
        }))}
        currentUserId={user.id}
        banner={banner}
        labels={{
          heading: t("heading"),
          subtitle: t("subtitle", { email: user.email ?? "" }),
          signOut: t("signOut"),
          back: tNav("home"),
          banners: {
            claimed: t("banners.claimed"),
            transfer_accepted: t("banners.transferAccepted"),
            transfer_sent: t("banners.transferSent"),
            transfer_revoked: t("banners.transferRevoked"),
            profile_saved: t("banners.profileSaved"),
          },
          profile: {
            heading: t("profile.heading"),
            displayName: t("profile.displayName"),
            country: t("profile.country"),
            countryHint: t("profile.countryHint"),
            save: t("profile.save"),
            saving: t("profile.saving"),
            errors: {
              validation: t("profile.errors.validation"),
              generic: t("profile.errors.generic"),
            },
          },
          owned: {
            heading: t("owned.heading"),
            empty: t("owned.empty"),
            view: t("owned.view"),
            transfer: t("owned.transfer"),
          },
          transferModal: {
            title: t("transferModal.title"),
            intro: t("transferModal.intro"),
            email: t("transferModal.email"),
            note: t("transferModal.note"),
            noteHint: t("transferModal.noteHint"),
            submit: t("transferModal.submit"),
            submitting: t("transferModal.submitting"),
            cancel: t("transferModal.cancel"),
            successTitle: t("transferModal.successTitle"),
            successBody: t("transferModal.successBody"),
            successDismiss: t("transferModal.successDismiss"),
            errors: {
              validation: t("transferModal.errors.validation"),
              self_transfer: t("transferModal.errors.selfTransfer"),
              pending_transfer_exists: t(
                "transferModal.errors.pendingExists",
              ),
              email_failed: t("transferModal.errors.emailFailed"),
              generic: t("transferModal.errors.generic"),
            },
          },
          history: {
            heading: t("history.heading"),
            empty: t("history.empty"),
            createdAt: t("history.createdAt"),
            recipient: t("history.recipient"),
            status: t("history.status"),
            revoke: t("history.revoke"),
            revoking: t("history.revoking"),
            statuses: {
              pending: tStatus("pending"),
              accepted: tStatus("accepted"),
              revoked: tStatus("revoked"),
              expired: tStatus("expired"),
            },
          },
        }}
      />
      <SiteFooter locale={locale} />
    </>
  );
}
