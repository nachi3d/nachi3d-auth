import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { listAllPublishedForSitemap } from "@/lib/server/gallery";
import { signToken } from "@/lib/hmac";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const locales = routing.locales as ReadonlyArray<string>;
  const now = new Date();

  // 1) Static pages per locale.
  const staticEntries: MetadataRoute.Sitemap = locales.flatMap((locale) => [
    {
      url: `${base}/${locale}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${base}/${locale}/gallery`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: `${base}/${locale}/legal/mentions`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    },
    {
      url: `${base}/${locale}/legal/privacy`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    },
    {
      url: `${base}/${locale}/legal/terms`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    },
  ]);

  // 2) Every published piece's verification URL, signed token included
  // so crawlers (and shared links) resolve straight to the verified
  // page without a tamper redirect. Sitemap covers all published
  // pieces — show_in_gallery only gates /gallery, not discoverability.
  const pieces = await listAllPublishedForSitemap();
  const pieceEntries: MetadataRoute.Sitemap = pieces.flatMap((p) => {
    const token = signToken(p.nfc_uid, p.id);
    return locales.map((locale) => ({
      url: `${base}/${locale}/v/${p.nfc_uid}?t=${token}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  });

  return [...staticEntries, ...pieceEntries];
}
