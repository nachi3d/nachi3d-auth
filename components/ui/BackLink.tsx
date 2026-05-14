import Link from "next/link";
import { isRtl, type Locale } from "@/i18n/routing";

interface BackLinkProps {
  locale: Locale;
  href: string;
  label: string;
}

export function BackLink({ locale, href, label }: BackLinkProps) {
  const arrow = isRtl(locale) ? "→" : "←";
  return (
    <Link
      href={href}
      data-testid="back-link"
      className="mb-6 inline-flex items-center gap-2 text-xs text-dark-text-200 transition hover:text-primary-400"
    >
      <span aria-hidden>{arrow}</span>
      <span>{label}</span>
    </Link>
  );
}
