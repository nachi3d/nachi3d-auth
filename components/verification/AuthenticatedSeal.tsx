interface AuthenticatedSealProps {
  label: string;
}

export function AuthenticatedSeal({ label }: AuthenticatedSealProps) {
  return (
    <div
      data-testid="authenticated-seal"
      className="nachi-fade-in inline-flex items-center gap-3 rounded-full border border-primary-400/50 bg-dark-900/60 px-4 py-1.5 ring-1 ring-primary-400/20"
    >
      <span
        aria-hidden
        className="block h-1.5 w-1.5 rounded-full bg-primary-500 shadow-[0_0_10px_rgba(108,99,255,0.7)]"
      />
      <span className="text-xs uppercase tracking-[0.25em] text-primary-400">
        {label}
      </span>
    </div>
  );
}
