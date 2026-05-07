interface AuthenticatedSealProps {
  label: string;
}

export function AuthenticatedSeal({ label }: AuthenticatedSealProps) {
  return (
    <div
      data-testid="authenticated-seal"
      className="nachi-fade-in inline-flex items-center gap-3 rounded-full border border-brass-400/60 bg-ink-900/60 px-4 py-1.5"
    >
      <span
        aria-hidden
        className="block h-1.5 w-1.5 rounded-full bg-brass-400 shadow-[0_0_8px_rgba(201,165,90,0.6)]"
      />
      <span className="text-xs uppercase tracking-[0.25em] text-brass-300">
        {label}
      </span>
    </div>
  );
}
