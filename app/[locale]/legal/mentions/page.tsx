// LEGAL: reviewed and adapted by Seàn McGannon; consult a lawyer before
// scaling to high-volume sales.
// LEGAL TODO: confirm the operator's preferred contact email
// (currently contact@nachi3dlabs.com in i18n/{en,fr,ar}.json).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import {
  LegalPage,
  formatLegalDate,
} from "@/components/legal/LegalPage";
import { SiteFooter } from "@/components/ui/SiteFooter";

export const dynamic = "force-static";

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
