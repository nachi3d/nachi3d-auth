-- DEPRECATED 2026-05-13: compute_piece_verification_token() is no longer
-- called by any code path. All HMAC token computation now happens in Node
-- via lib/hmac.ts signToken(). Kept here for migration history continuity
-- only. Do not call from new code.
--
-- Why deprecated: Supabase hosted projects strip the superuser ALTER
-- DATABASE privilege, so `alter database postgres set app.hmac_secret =
-- '...'` is rejected (42501). The GUC-based approach is no longer viable
-- on the only environment we deploy to. The runtime always recomputed
-- the token in Node anyway and only constant-time compared, so removing
-- this function from active use changes nothing observable; rotation now
-- happens entirely in Node via scripts/rotate-tokens.ts.
--
-- The function definition + the one-shot backfill UPDATE below are kept
-- so the migration history remains replayable for any fresh database.
-- The backfill runs once at migration time against the placeholder
-- tokens inserted by earlier migrations / seed; on a hosted project
-- where app.hmac_secret is unset it produces empty-key HMACs, which is
-- harmless because rotate-tokens.ts (or seed-remote.ts) overwrites them
-- with real Node-computed values immediately after.
--
-- See: scripts/rotate-tokens.ts, scripts/seed-remote.ts, lib/hmac.ts

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
