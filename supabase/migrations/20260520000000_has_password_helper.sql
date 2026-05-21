-- Phase 5-prep — optional password setup for collectors
--
-- Supabase doesn't expose a "user has a password" boolean directly.
-- The only authoritative signal lives in `auth.users.encrypted_password`
-- (NULL for users who only sign in via magic link / OAuth, non-NULL
-- once any password has been set).
--
-- `public.has_password()` is a SECURITY DEFINER helper that returns
-- whether the currently-authenticated user has a password set. It
-- never returns or accepts a password — only a boolean — and is scoped
-- to `auth.uid()` so a caller can only ask about themselves. The
-- function is callable by the `authenticated` and `service_role` roles
-- only; anon cannot probe it.
--
-- Why this is safe to ship in production:
--   - The function reveals one bit of information (encrypted_password
--     IS NOT NULL) for the *calling* user only — they already know
--     this about themselves.
--   - SECURITY DEFINER + explicit `search_path` blocks the usual
--     search-path injection vector.
--   - Service-role bypasses RLS but the function takes no arguments,
--     so even a misuse from a server route cannot leak another user's
--     status.

create or replace function public.has_password()
  returns boolean
  language sql
  security definer
  set search_path = public, auth
as $fn$
  select exists (
    select 1
    from auth.users
    where id = auth.uid()
      and encrypted_password is not null
      and encrypted_password <> ''
  );
$fn$;

revoke all on function public.has_password() from public;
grant execute on function public.has_password() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- e2e helper — clear a user's password
-- ---------------------------------------------------------------------
--
-- The seed collector ships with a known password
-- (test-collector-password-do-not-use) so /api/test/signin can mint
-- their session for the rest of the suite. The "collector with no
-- password" case in tests/e2e/password.spec.ts needs to clear the
-- password before the assertion runs and restore it afterwards.
--
-- Supabase JS's `auth.admin.updateUserById` cannot null
-- `encrypted_password`, so we expose a tightly-scoped SQL helper. It
-- is:
--   - SECURITY DEFINER so the service-role caller doesn't need direct
--     auth-schema write permissions;
--   - granted to service_role ONLY (the role used exclusively by the
--     server-side admin client; never reachable from anon, authenticated,
--     or the browser);
--   - prefixed `e2e_` so any future reader immediately recognizes the
--     test-only intent.
--
-- The function is invoked by tests/e2e/fixtures/password.ts via
-- `supabase.rpc('e2e_clear_user_password', { p_user_id })`.

create or replace function public.e2e_clear_user_password(p_user_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, auth
as $fn$
begin
  update auth.users
    set encrypted_password = null
    where id = p_user_id;
end;
$fn$;

revoke all on function public.e2e_clear_user_password(uuid) from public;
grant execute on function public.e2e_clear_user_password(uuid) to service_role;
