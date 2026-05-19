import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale, type Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { claimPiece, getClaimByToken } from "@/lib/server/claims";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { BackLink } from "@/components/ui/BackLink";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string; token: string }>;
}

export default async function ClaimHandlerPage({ params }: PageProps) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("claim.handler");
  const tNav = await getTranslations("nav");

  // The magic-link callback should have set the session before this
  // page runs. If it didn't (link expired and the OTP exchange failed,
  // or the user copy-pasted the URL into a different browser), bounce
  // them home with the "expired" screen.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <ClaimErrorView
        locale={locale}
        title={t("expiredTitle")}
        body={t("expiredBody")}
        backLabel={tNav("home")}
      />
    );
  }

  const claim = await getClaimByToken(token);
  if (!claim) {
    return (
      <ClaimErrorView
        locale={locale}
        title={t("invalidTitle")}
        body={t("invalidBody")}
        backLabel={tNav("home")}
      />
    );
  }

  // The token is bound to the email the magic-link was sent to. The
  // session must be the same email — otherwise someone could forward
  // the link and have a stranger claim the piece.
  if (
    user.email &&
    claim.email.toLowerCase() !== user.email.toLowerCase()
  ) {
    return (
      <ClaimErrorView
        locale={locale}
        title={t("emailMismatchTitle")}
        body={t("emailMismatchBody")}
        backLabel={tNav("home")}
      />
    );
  }

  if (claim.consumed_at !== null) {
    // Already redeemed — redirect to /me where the piece is listed.
    redirect(`/${locale}/me`);
  }

  const result = await claimPiece({
    token,
    user_id: user.id,
    display_name: claim.display_name ?? "",
    country: claim.country ?? "",
  });

  if (!result.ok) {
    if (result.error === "already_claimed") {
      return (
        <ClaimErrorView
          locale={locale}
          title={t("alreadyClaimedTitle")}
          body={t("alreadyClaimedBody")}
          backLabel={tNav("home")}
        />
      );
    }
    if (result.error === "expired") {
      return (
        <ClaimErrorView
          locale={locale}
          title={t("expiredTitle")}
          body={t("expiredBody")}
          backLabel={tNav("home")}
        />
      );
    }
    return (
      <ClaimErrorView
        locale={locale}
        title={t("invalidTitle")}
        body={t("invalidBody")}
        backLabel={tNav("home")}
      />
    );
  }

  redirect(`/${locale}/me?claimed=1`);
}

interface ErrorViewProps {
  locale: string;
  title: string;
  body: string;
  backLabel: string;
}

function ClaimErrorView({ locale, title, body, backLabel }: ErrorViewProps) {
  return (
    <>
      <main
        data-testid="claim-error"
        className="brand-atmosphere mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-24"
      >
        <BackLink locale={locale as Locale} href={`/${locale}`} label={backLabel} />
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-primary-400">
          Nachi3D Certify
        </p>
        <h1 className="text-3xl font-serif font-light leading-tight text-white md:text-4xl">
          {title}
        </h1>
        <p className="mt-6 text-base leading-relaxed text-dark-text-100">{body}</p>
        <Link
          href={`/${locale}`}
          className="mt-8 inline-block w-fit rounded-sm border border-primary-500/40 px-4 py-2 text-sm text-primary-300 transition hover:border-primary-500 hover:text-primary-200"
        >
          {backLabel}
        </Link>
      </main>
      <SiteFooter locale={locale as Locale} />
    </>
  );
}
