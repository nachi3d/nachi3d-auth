-- compute_piece_verification_token mirrors lib/hmac.ts signToken():
--   substring(hex(hmac(sha256, app.hmac_secret, "<uid>:<piece_id>")), 1, 24)
--
-- The secret is read from the `app.hmac_secret` Postgres setting so the
-- DB never has the value in the migration history. To set it on a
-- Supabase project (run once, as a privileged role):
--
--   alter database postgres set app.hmac_secret = 'your-real-secret';
--
-- For the local Supabase stack, add the same statement to a .sql file
-- in supabase/seed-secrets/ (gitignored) and source it before db reset,
-- or run it directly against the local Postgres.
--
-- If the setting is unset, the function returns a token computed with an
-- empty key. The runtime never trusts the stored value (it always
-- recomputes from HMAC_SECRET + nfc_uid + piece_id and constant-time
-- compares to the URL `t` param), so a stale stored token is harmless —
-- but it will mismatch any URL the app generates. Phase 3 card PDFs
-- read piece_id+nfc_uid and re-sign at render time, so they are also
-- safe.

create or replace function public.compute_piece_verification_token(
  uid text,
  piece_id uuid
) returns text
language sql
stable
as $$
  select substring(
    encode(
      hmac(
        (uid || ':' || piece_id::text)::bytea,
        coalesce(current_setting('app.hmac_secret', true), '')::bytea,
        'sha256'
      ),
      'hex'
    )
    from 1 for 24
  );
$$;

-- Backfill any existing pieces (incl. the Phase 1 seed row that landed
-- with a placeholder).
update public.pieces
   set verification_token = public.compute_piece_verification_token(
     nfc_uid, id
   )
 where verification_token = 'placeholder-recomputed-at-runtime'
    or verification_token is null
    or verification_token = '';
