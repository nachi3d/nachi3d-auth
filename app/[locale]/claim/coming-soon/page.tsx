import { notFound } from "next/navigation";
import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";

export const dynamic = "force-static";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function ClaimComingSoonPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("claim.comingSoon");

  return (
    <main className="brand-atmosphere mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-24">
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-primary-400">
        Nachi3D Certify
      </p>
      <h1 className="text-3xl font-serif font-light leading-tight text-white md:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-6 text-base leading-relaxed text-dark-text-100">{t("body")}</p>
      <Link
        href={`/${locale}`}
        className="mt-8 inline-block w-fit rounded-sm border border-dark-700 px-4 py-2 text-sm text-dark-text-100 transition hover:border-primary-500 hover:text-primary-400"
      >
        {t("back")}
      </Link>
    </main>
  );
}
