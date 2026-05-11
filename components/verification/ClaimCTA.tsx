import Link from "next/link";

interface ClaimCTAProps {
  href: string;
  title: string;
  body: string;
  buttonLabel: string;
}

export function ClaimCTA({ href, title, body, buttonLabel }: ClaimCTAProps) {
  return (
    <aside
      data-testid="claim-cta"
      className="nachi-print-hide mt-16 rounded-sm border border-primary-500/30 bg-dark-800/40 p-6"
    >
      <h2 className="text-xs uppercase tracking-[0.25em] text-primary-400">
        {title}
      </h2>
      <p className="mt-2 text-sm text-dark-text-100">{body}</p>
      <Link
        href={href}
        data-testid="claim-cta-button"
        className="mt-4 inline-block rounded-sm bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
      >
        {buttonLabel}
      </Link>
    </aside>
  );
}
