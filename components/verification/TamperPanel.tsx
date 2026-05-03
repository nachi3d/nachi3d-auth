interface TamperPanelProps {
  title: string;
  body: string;
}

export function TamperPanel({ title, body }: TamperPanelProps) {
  return (
    <main
      data-testid="verification-tamper-banner"
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-24"
    >
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-red-400">
        Nachi3D Certify
      </p>
      <h1 className="text-3xl font-serif font-light leading-tight text-ink-50 md:text-4xl">
        {title}
      </h1>
      <p className="mt-6 text-base leading-relaxed text-ink-300">{body}</p>
    </main>
  );
}
