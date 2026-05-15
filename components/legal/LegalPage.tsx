import { getTranslations } from "next-intl/server";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import type { Locale } from "@/i18n/routing";

interface Section {
  title: string;
  paragraphs: string[];
}

interface LegalLabels {
  navHome: string;
  navCurrent: string;
  lastUpdated: string;
}

export async function LegalPage({
  locale,
  namespace,
  lastUpdated,
  labels,
}: {
  locale: Locale;
  namespace: "legal.mentions" | "legal.privacy" | "legal.terms";
  lastUpdated: string;
  labels: LegalLabels;
}) {
  const t = await getTranslations(namespace);
  const title = t("title");
  const intro = t("intro");
  const sections = t.raw("sections") as Section[];

  return (
    <main
      data-testid={`legal-page-${namespace.split(".")[1]}`}
      className="brand-atmosphere mx-auto max-w-3xl px-6 py-16"
    >
      <Breadcrumb
        locale={locale}
        segments={[
          { label: labels.navHome, href: `/${locale}` },
          { label: labels.navCurrent },
        ]}
      />
      <header className="mb-10 border-b border-dark-700 pb-8">
        <p className="mb-2 text-xs uppercase tracking-[0.3em] text-primary-400">
          Nachi3D Certify
        </p>
        <h1
          className="text-3xl font-serif font-light text-white md:text-4xl"
          data-testid="legal-title"
        >
          {title}
        </h1>
        <p
          className="mt-4 text-sm text-dark-text-200"
          data-testid="legal-last-updated"
        >
          {labels.lastUpdated}
        </p>
        <p className="mt-6 text-base leading-relaxed text-dark-text-100">
          {intro}
        </p>
      </header>

      <article className="space-y-10">
        {sections.map((section, idx) => (
          <section
            key={idx}
            data-testid={`legal-section-${idx}`}
            className="space-y-3"
          >
            <h2 className="text-lg font-serif text-white">{section.title}</h2>
            {section.paragraphs.map((paragraph, pIdx) => (
              <p
                key={pIdx}
                className="text-sm leading-relaxed text-dark-text-100"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}

export function formatLegalDate(iso: string, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
