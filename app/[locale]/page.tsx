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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-24">
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-brass-400">
        Nachi3D
      </p>
      <h1 className="text-4xl font-serif font-light leading-tight text-ink-50 md:text-5xl">
        {t("title")}
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-ink-300">
        {t("subtitle")}
      </p>

      <section className="mt-16 border-t border-ink-700 pt-10">
        <h2 className="mb-6 text-xs uppercase tracking-[0.25em] text-ink-400">
          {t("howItWorks")}
        </h2>
        <ol className="space-y-4 text-ink-200">
          <li className="flex gap-4">
            <span className="font-serif text-brass-400">1.</span>
            <span>{t("step1")}</span>
          </li>
          <li className="flex gap-4">
            <span className="font-serif text-brass-400">2.</span>
            <span>{t("step2")}</span>
          </li>
          <li className="flex gap-4">
            <span className="font-serif text-brass-400">3.</span>
            <span>{t("step3")}</span>
          </li>
        </ol>
      </section>

      <p className="mt-16 text-sm text-ink-400">{t("learnMore")}</p>
    </main>
  );
}
