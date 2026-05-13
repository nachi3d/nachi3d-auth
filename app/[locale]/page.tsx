import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function LandingPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations("landing");

  return (
    <main className="brand-atmosphere mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-24">
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-primary-400">
        Nachi3D
      </p>
      <h1 className="text-4xl font-serif font-light leading-tight text-white md:text-5xl">
        {t("title")}
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-dark-text-100">
        {t("subtitle")}
      </p>

      <div className="mt-8">
        <Link
          href={`/${locale}/gallery`}
          data-testid="landing-gallery-cta"
          className="inline-flex items-center gap-2 rounded-sm border border-primary-500/50 px-5 py-2.5 text-sm text-primary-400 transition hover:border-primary-500 hover:bg-primary-500/10"
        >
          {t("viewGallery")}
          <span aria-hidden>→</span>
        </Link>
      </div>

      <section className="mt-16 border-t border-dark-700 pt-10">
        <h2 className="mb-6 text-xs uppercase tracking-[0.25em] text-dark-text-200">
          {t("howItWorks")}
        </h2>
        <ol className="space-y-4 text-dark-text-100">
          <li className="flex gap-4">
            <span className="font-serif text-primary-400">1.</span>
            <span>{t("step1")}</span>
          </li>
          <li className="flex gap-4">
            <span className="font-serif text-primary-400">2.</span>
            <span>{t("step2")}</span>
          </li>
          <li className="flex gap-4">
            <span className="font-serif text-primary-400">3.</span>
            <span>{t("step3")}</span>
          </li>
        </ol>
      </section>

      <p className="mt-16 text-sm text-dark-text-200">{t("learnMore")}</p>
    </main>
  );
}
