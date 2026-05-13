import { logoutAction } from "@/app/[locale]/admin/actions";
import type { Locale } from "@/i18n/routing";

interface AdminTopBarProps {
  locale: Locale;
  email: string;
  signedInAsLabel: string;
  signOutLabel: string;
}

export function AdminTopBar({
  locale,
  email,
  signedInAsLabel,
  signOutLabel,
}: AdminTopBarProps) {
  return (
    <div
      data-testid="admin-topbar"
      className="border-b border-dark-700 bg-dark-900/40"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-end gap-4 px-6 py-3 text-xs text-dark-text-200">
        <span data-testid="admin-topbar-email">{signedInAsLabel}</span>
        <form action={logoutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            data-testid="admin-logout"
            className="rounded-sm px-2 py-1 text-dark-text-200 underline-offset-2 transition hover:text-primary-400 hover:underline"
            aria-label={signOutLabel}
          >
            {signOutLabel}
          </button>
        </form>
        {/* Hidden element so tests can read the bare email string without
            dealing with the templated "Connecté en tant que…" wrapper. */}
        <span data-testid="admin-current-email" className="sr-only">
          {email}
        </span>
      </div>
    </div>
  );
}
