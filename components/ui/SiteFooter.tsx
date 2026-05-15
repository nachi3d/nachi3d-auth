import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

/**
 * Site-wide footer rendered on every public page (landing, gallery,
 * verification happy-path, login) and on admin pages. Intentionally
 * omitted from tamper and not-found panels so error states stay
 * minimal — those branches render their own panel and return before
 * the page-level footer is drawn.
 *
 * Server component. Year is computed server-side, so a long-cached
 * page still rolls over on Jan 1 the next time it's rebuilt.
 */
export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations("footer");
  const year = new Date().getFullYear();

  const links: Array<{ key: string; href: string; label: string }> = [
    {
      key: "mentions",
      href: `/${locale}/legal/mentions`,
      label: t("mentions"),
    },
    { key: "privacy", href: `/${locale}/legal/privacy`, label: t("privacy") },
    { key: "terms", href: `/${locale}/legal/terms`, label: t("terms") },
  ];

  return (
    <footer
      data-testid="site-footer"
      className="mt-16 border-t border-dark-700 bg-dark-950/60"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 text-xs text-dark-text-300 sm:flex-row sm:items-center sm:justify-between">
        <p data-testid="site-footer-copyright">
          {t("copyright", { year })}
        </p>
        <nav
          aria-label={t("ariaLabel")}
          className="flex flex-wrap gap-x-4 gap-y-2"
        >
          {links.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              data-testid={`site-footer-link-${link.key}`}
              className="transition hover:text-primary-400"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
