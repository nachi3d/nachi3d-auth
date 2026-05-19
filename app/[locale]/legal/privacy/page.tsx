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

export const dynamic = "force-dynamic";

const LAST_UPDATED = "2026-05-15";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  return { title: t("title") };
}

export default async function PrivacyPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const tLegal = await getTranslations("legal");
  const tNav = await getTranslations("nav");
  const tPrivacy = await getTranslations("legal.privacy");

  return (
    <>
      <PublicHeader locale={locale} />
      <LegalPage
        locale={locale}
        namespace="legal.privacy"
        lastUpdated={LAST_UPDATED}
        labels={{
          navHome: tNav("home"),
          navCurrent: tPrivacy("title"),
          lastUpdated: tLegal("lastUpdated", {
            date: formatLegalDate(LAST_UPDATED, locale),
          }),
        }}
      />
      <SiteFooter locale={locale} />
    </>
  );
}
