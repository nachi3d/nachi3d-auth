import Link from "next/link";
import { isRtl, type Locale } from "@/i18n/routing";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  locale: Locale;
  segments: BreadcrumbSegment[];
}

export function Breadcrumb({ locale, segments }: BreadcrumbProps) {
  if (segments.length === 0) return null;
  const rtl = isRtl(locale);
  const separator = rtl ? "‹" : "›";

  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="breadcrumb"
      className="mb-6 text-xs"
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <li key={`${segment.label}-${index}`} className="flex items-center gap-x-2">
              {segment.href && !isLast ? (
                <Link
                  href={segment.href}
                  data-testid={`breadcrumb-segment-${index}`}
                  className="text-dark-text-200 transition hover:text-primary-400"
                >
                  {segment.label}
                </Link>
              ) : (
                <span
                  data-testid={`breadcrumb-segment-${index}`}
                  aria-current={isLast ? "page" : undefined}
                  className="text-dark-text-100"
                >
                  {segment.label}
                </span>
              )}
              {!isLast ? (
                <span
                  aria-hidden
                  data-testid="breadcrumb-separator"
                  className="text-dark-text-200"
                >
                  {separator}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
