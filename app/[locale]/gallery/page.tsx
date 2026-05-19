import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { LICENSE_STATUSES } from "@/lib/validation/piece";
import {
  GALLERY_PAGE_SIZE,
  getGalleryHeroPhoto,
  getGalleryStats,
  listGalleryCards,
  parseLicenseFilter,
} from "@/lib/server/gallery";
import { GalleryBrowser } from "@/components/gallery/GalleryBrowser";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";

// PublicHeader reads the auth cookie on the server, so this route is
// dynamic per request. We previously cached the gallery at the edge
// (revalidate = 3600) but the header trades static SSR for a visible
// auth affordance — see CLAUDE.md "Routes & Surfaces".
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; license?: string }>;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "gallery" });
  const hero = await getGalleryHeroPhoto();
  const url = `${siteUrl()}/${locale}/gallery`;

  return {
    title: t("title"),
    description: t("subtitle"),
    alternates: {
      canonical: url,
      languages: {
        en: `${siteUrl()}/en/gallery`,
        fr: `${siteUrl()}/fr/gallery`,
        ar: `${siteUrl()}/ar/gallery`,
      },
    },
    openGraph: {
      type: "website",
      title: `${t("title")} — Nachi3D Certify`,
      description: t("subtitle"),
      url,
      siteName: "Nachi3D Certify",
      images: hero ? [{ url: hero, alt: t("title") }] : [],
    },
    twitter: {
      card: hero ? "summary_large_image" : "summary",
      title: `${t("title")} — Nachi3D Certify`,
      description: t("subtitle"),
      images: hero ? [hero] : [],
    },
    robots: { index: true, follow: true },
  };
}

export default async function GalleryPage({
  params,
  searchParams,
}: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const license = parseLicenseFilter(sp.license);

  const [{ cards, total, hasMore }, stats] = await Promise.all([
    listGalleryCards({ page, pageSize: GALLERY_PAGE_SIZE, license }),
    getGalleryStats(),
  ]);

  const t = await getTranslations({ locale, namespace: "gallery" });
  const tFilters = await getTranslations({
    locale,
    namespace: "gallery.filters",
  });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  const filterLabels = {
    original: tFilters("original"),
    public_domain: tFilters("public_domain"),
    commission: tFilters("commission"),
    licensed: tFilters("licensed"),
    other: tFilters("other"),
  } satisfies Record<(typeof LICENSE_STATUSES)[number], string>;

  return (
    <>
    <PublicHeader locale={locale} />
    <main
      className="brand-atmosphere mx-auto max-w-6xl px-6 py-16"
      data-testid="gallery-page"
    >
      <Breadcrumb
        locale={locale}
        segments={[
          { label: tNav("home"), href: `/${locale}` },
          { label: tNav("gallery") },
        ]}
      />
      <header className="mb-12 border-b border-dark-700 pb-10">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-primary-400">
          Nachi3D Certify
        </p>
        <h1
          className="text-4xl font-serif font-light text-white md:text-5xl"
          data-testid="gallery-title"
        >
          {t("trilingualTitle")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-dark-text-100">
          {t("subtitle")}
        </p>

        <dl
          className="mt-8 flex flex-wrap gap-x-10 gap-y-2 text-sm text-dark-text-200"
          data-testid="gallery-stats"
        >
          <div data-testid="gallery-stat-authenticated">
            {t("stats.authenticated", { count: stats.authenticated })}
          </div>
          <div data-testid="gallery-stat-claimed">
            <span aria-hidden>·</span>{" "}
            {t("stats.claimed", { count: stats.claimed })}
          </div>
        </dl>
      </header>

      {total === 0 ? (
        <p
          data-testid="gallery-empty"
          className="rounded-sm border border-dashed border-dark-700 bg-dark-900/40 px-6 py-20 text-center text-dark-text-100"
        >
          {t("empty")}
        </p>
      ) : (
        <GalleryBrowser
          locale={locale}
          initialCards={cards}
          initialPage={page}
          initialHasMore={hasMore}
          initialLicense={license}
          labels={{
            filtersLabel: tFilters("label"),
            filterAll: tFilters("all"),
            filters: filterLabels,
            searchPlaceholder: t("search.placeholder"),
            clearHint: t("search.clearHint"),
            emptyFiltered: t("emptyFiltered"),
            loadMore: t("loadMore"),
          }}
        />
      )}
    </main>
    <SiteFooter locale={locale} />
    </>
  );
}
