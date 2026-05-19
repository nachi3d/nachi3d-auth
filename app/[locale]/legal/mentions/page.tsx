// LEGAL: reviewed and adapted by Seàn McGannon; consult a lawyer before
// scaling to high-volume sales.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import {
  LegalPage,
  formatLegalDate,
} from "@/components/legal/LegalPage";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";

// PublicHeader reads the auth cookie, so the page is per-request
// dynamic. We lose force-static caching but gain a visible auth
// affordance on every public surface.
export const dynamic = "force-dynamic";

// Bump on every edit to the mentions content (i18n strings or layout).
const LAST_UPDATED = "2026-05-15";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "legal.mentions" });
  return { title: t("title") };
}

export default async function MentionsPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const tLegal = await getTranslations("legal");
  const tNav = await getTranslations("nav");
  const tMentions = await getTranslations("legal.mentions");

  return (
    <>
      <PublicHeader locale={locale} />
      <LegalPage
        locale={locale}
        namespace="legal.mentions"
        lastUpdated={LAST_UPDATED}
        labels={{
          navHome: tNav("home"),
          navCurrent: tMentions("title"),
          lastUpdated: tLegal("lastUpdated", {
            date: formatLegalDate(LAST_UPDATED, locale),
          }),
        }}
      />
      <SiteFooter locale={locale} />
    </>
  );
}
