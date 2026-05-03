interface TamperPanelProps {
  title: string;
  body: string;
  supportEmail?: string;
  supportLabel?: string;
}

export function TamperPanel({
  title,
  body,
  supportEmail = "hello@nachi3d.com",
  supportLabel,
}: TamperPanelProps) {
  return (
    <main
      data-testid="verification-tamper-banner"
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-24"
    >
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-red-400">
        Nachi3D Certify
      </p>
      <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-red-500/40 bg-red-950/40 px-3 py-1">
        <span
          aria-hidden
          className="block h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]"
        />
        <span className="text-[0.65rem] uppercase tracking-[0.25em] text-red-300">
          {title.toUpperCase()}
        </span>
      </div>
      <h1 className="text-3xl font-serif font-light leading-tight text-ink-50 md:text-4xl">
        {title}
      </h1>
      <p className="mt-6 text-base leading-relaxed text-ink-300">{body}</p>
      <a
        data-testid="tamper-support-cta"
        href={`mailto:${supportEmail}`}
        className="mt-8 inline-block w-fit rounded-sm border border-red-500/40 px-4 py-2 text-sm text-red-200 transition hover:border-red-400 hover:text-red-100"
      >
        {supportLabel ?? supportEmail}
      </a>
    </main>
  );
}
