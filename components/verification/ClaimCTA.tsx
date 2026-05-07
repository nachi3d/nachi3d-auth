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
      className="nachi-print-hide mt-16 rounded-sm border border-brass-400/40 bg-ink-800/40 p-6"
    >
      <h2 className="text-xs uppercase tracking-[0.25em] text-brass-400">
        {title}
      </h2>
      <p className="mt-2 text-sm text-ink-200">{body}</p>
      <Link
        href={href}
        data-testid="claim-cta-button"
        className="mt-4 inline-block rounded-sm bg-brass-400 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-brass-300"
      >
        {buttonLabel}
      </Link>
    </aside>
  );
}
