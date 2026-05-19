import { notFound } from "next/navigation";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale, type Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTransferByToken } from "@/lib/server/transfers";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { BackLink } from "@/components/ui/BackLink";
import { TransferAcceptForm } from "@/components/transfer/TransferAcceptForm";
import { PublicHeader } from "@/components/layout/PublicHeader";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string; token: string }>;
}

export default async function TransferHandlerPage({ params }: PageProps) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("transfer.handler");
  const tNav = await getTranslations("nav");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ErrorView
        locale={locale}
        title={t("notSignedInTitle")}
        body={t("notSignedInBody")}
        backLabel={tNav("home")}
      />
    );
  }

  const transfer = await getTransferByToken(token);
  if (!transfer) {
    return (
      <ErrorView
        locale={locale}
        title={t("invalidTitle")}
        body={t("invalidBody")}
        backLabel={tNav("home")}
      />
    );
  }

  if (user.email && transfer.to_email.toLowerCase() !== user.email.toLowerCase()) {
    return (
      <ErrorView
        locale={locale}
        title={t("emailMismatchTitle")}
        body={t("emailMismatchBody")}
        backLabel={tNav("home")}
      />
    );
  }

  if (transfer.status === "accepted") {
    return (
      <ErrorView
        locale={locale}
        title={t("acceptedTitle")}
        body={t("acceptedBody")}
        backLabel={tNav("home")}
      />
    );
  }
  if (transfer.status === "revoked") {
    return (
      <ErrorView
        locale={locale}
        title={t("revokedTitle")}
        body={t("revokedBody")}
        backLabel={tNav("home")}
      />
    );
  }
  if (transfer.status === "expired" || new Date(transfer.expires_at) < new Date()) {
    return (
      <ErrorView
        locale={locale}
        title={t("expiredTitle")}
        body={t("expiredBody")}
        backLabel={tNav("home")}
      />
    );
  }

  // Pending — fetch piece details for the preview card.
  const sb = createAdminClient();
  const { data: piece } = await sb
    .from("pieces")
    .select("id, piece_number, character_name, nfc_uid, photos")
    .eq("id", transfer.piece_id)
    .maybeSingle();
  if (!piece) {
    return (
      <ErrorView
        locale={locale}
        title={t("invalidTitle")}
        body={t("invalidBody")}
        backLabel={tNav("home")}
      />
    );
  }

  const pieceNumber = String(piece.piece_number).padStart(4, "0");
  const hero = piece.photos?.[0] ?? null;

  return (
    <>
      <PublicHeader locale={locale} />
      <main
        data-testid="transfer-handler"
        className="brand-atmosphere mx-auto max-w-xl px-6 py-16"
      >
        <BackLink locale={locale} href={`/${locale}/me`} label={tNav("back")} />
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-primary-400">
          Nachi3D Certify
        </p>
        <h1 className="text-3xl font-serif font-light leading-tight text-white md:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-dark-text-100">
          {t("body")}
        </p>

        <div
          data-testid="transfer-preview"
          className="mt-8 flex items-center gap-4 rounded-sm border border-dark-700 bg-dark-900/40 p-4"
        >
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero}
              alt={piece.character_name}
              className="h-16 w-16 rounded-sm object-cover"
            />
          ) : (
            <div className="h-16 w-16 rounded-sm bg-dark-800" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm text-primary-400">#{pieceNumber}</p>
            <p
              className="truncate text-base text-white"
              data-testid="transfer-preview-character"
            >
              {piece.character_name}
            </p>
          </div>
        </div>

        {transfer.note ? (
          <blockquote
            data-testid="transfer-note"
            className="mt-6 border-l-2 border-primary-500/40 bg-dark-900/40 px-4 py-3 text-sm italic text-dark-text-100"
          >
            {transfer.note}
          </blockquote>
        ) : null}

        <TransferAcceptForm
          token={token}
          locale={locale}
          labels={{
            accept: t("accept"),
            accepting: t("accepting"),
            decline: t("decline"),
            errors: {
              email_mismatch: t("emailMismatchTitle"),
              already_claimed: t("acceptedTitle"),
              expired: t("expiredTitle"),
              accepted: t("acceptedTitle"),
              revoked: t("revokedTitle"),
              ownership_changed: t("ownershipChangedBody"),
              generic: t("invalidBody"),
            },
          }}
        />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

interface ErrorViewProps {
  locale: Locale;
  title: string;
  body: string;
  backLabel: string;
}

function ErrorView({ locale, title, body, backLabel }: ErrorViewProps) {
  return (
    <>
      <PublicHeader locale={locale} />
      <main
        data-testid="transfer-error"
        className="brand-atmosphere mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-24"
      >
        <BackLink locale={locale} href={`/${locale}`} label={backLabel} />
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-primary-400">
          Nachi3D Certify
        </p>
        <h1 className="text-3xl font-serif font-light leading-tight text-white md:text-4xl">
          {title}
        </h1>
        <p className="mt-6 text-base leading-relaxed text-dark-text-100">
          {body}
        </p>
        <Link
          href={`/${locale}`}
          className="mt-8 inline-block w-fit rounded-sm border border-primary-500/40 px-4 py-2 text-sm text-primary-300 transition hover:border-primary-500 hover:text-primary-200"
        >
          {backLabel}
        </Link>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
