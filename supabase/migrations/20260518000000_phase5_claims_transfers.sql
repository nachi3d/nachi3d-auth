-- Phase 5 — owner claim + transfer
--
-- Adds two tables (claims, transfers) and two atomic SECURITY DEFINER
-- functions (claim_piece, accept_transfer) so the race window between
-- "fetch row" and "update row" is closed inside a single transaction
-- with row-level locks.
--
-- Magic-link auth flow: a Node server action validates input, generates
-- a random one-time `token`, inserts a claims/transfers row scoped to
-- the recipient email, then asks Supabase Auth to send a magic-link
-- email with `emailRedirectTo` pointing at `/auth/callback?next=...`.
-- The callback exchanges the OTP for a cookie session and forwards to
-- /[locale]/{claim,transfer}/[token], which calls the atomic function
-- via the service-role admin client.
--
-- RLS is intentionally tight: anonymous + authenticated roles can READ
-- their own transfers (from_owner_id = auth.uid()) and authenticated
-- owners can INSERT a transfer for a piece they own; everything else
-- (claims read/write, transfers update, status changes) goes through
-- service-role server code that bypasses RLS.
--
-- `is_fixture` follows the same convention as pieces.is_fixture — the
-- seed prune scopes by it so test runs never touch a real customer's
-- claim or transfer history. Admin and public APIs strip the field.

create extension if not exists "pgcrypto";

-- ===========================================================================
-- claims
-- ===========================================================================
--
-- One row per "I want to claim this piece" submission. The token is
-- emitted to the claimant via the magic-link redirect URL; the email
-- is what Supabase Auth's signInWithOtp signs (so the recipient must
-- own the inbox to ever read the link).
--
-- The display_name + country columns hold the values the claimant
-- entered in the /v/[uid] modal so the claim handler can populate
-- their profile without an extra round trip.
--
-- consumed_at marks the claim as redeemed. expires_at is set to
-- now() + 1 hour by the server (matches Supabase magic-link default).
-- An expired claim row stays in the table for audit; the claimant can
-- request a new one which creates a fresh row.

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces(id) on delete cascade,
  email text not null,
  display_name text,
  country text check (country is null or char_length(country) = 2),
  token text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  is_fixture boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists claims_piece_id_idx on public.claims (piece_id);
create index if not exists claims_email_idx on public.claims (lower(email));
create index if not exists claims_fixture_idx
  on public.claims (id)
  where is_fixture = true;

-- ===========================================================================
-- transfers
-- ===========================================================================
--
-- One row per "I want to transfer ownership" action. Status moves
-- pending → accepted | revoked | expired. Only one terminal state is
-- ever recorded; the row is not deleted so /me can render the full
-- transfer history.
--
-- to_email is the recipient (case-insensitive match against
-- auth.users.email when accepting). The note is plain text, capped at
-- the application layer.

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces(id) on delete cascade,
  from_owner_id uuid not null references public.profiles(id) on delete cascade,
  to_email text not null,
  to_owner_id uuid references public.profiles(id) on delete set null,
  token text not null unique,
  status text not null default 'pending'
    check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  note text,
  is_fixture boolean not null default false,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists transfers_piece_id_idx on public.transfers (piece_id);
create index if not exists transfers_from_owner_idx on public.transfers (from_owner_id);
create index if not exists transfers_to_email_idx on public.transfers (lower(to_email));
create index if not exists transfers_status_idx on public.transfers (status);
create index if not exists transfers_fixture_idx
  on public.transfers (id)
  where is_fixture = true;

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.claims enable row level security;
alter table public.transfers enable row level security;

-- claims: no anon read, no authenticated read. Service-role bypasses
-- RLS. The token is emitted only via the magic-link email, never in a
-- query result, so we don't want any role to be able to enumerate
-- pending claims.
--
-- Anonymous INSERT is the public surface: the /v/[uid] verification
-- page lets any anonymous visitor with the verification URL submit a
-- claim. The server validates the piece is unclaimed and the email is
-- well-formed before inserting; the row carries no sensitive data.
drop policy if exists claims_insert_anon on public.claims;
create policy claims_insert_anon on public.claims
  for insert with check (true);

-- transfers: an owner reads their own outgoing rows; an authenticated
-- user reads incoming rows addressed to their email. INSERT is allowed
-- for authenticated owners who own the piece. UPDATE / DELETE go
-- through service-role; no role policies for them.
drop policy if exists transfers_select_own on public.transfers;
create policy transfers_select_own on public.transfers
  for select using (
    auth.uid() = from_owner_id
    or auth.uid() = to_owner_id
    or lower(coalesce((auth.jwt() ->> 'email')::text, '')) = lower(to_email)
  );

drop policy if exists transfers_insert_owner on public.transfers;
create policy transfers_insert_owner on public.transfers
  for insert with check (
    auth.uid() = from_owner_id
    and exists (
      select 1 from public.pieces p
      where p.id = piece_id and p.current_owner_id = auth.uid()
    )
  );

-- ===========================================================================
-- claim_piece(p_token, p_user_id, p_display_name, p_country)
-- ===========================================================================
--
-- Atomically:
--   1. Lock + validate the claim row (token exists, not consumed, not expired)
--   2. Lock + validate the piece row (still unclaimed)
--   3. Update the claimant's profile with display_name + country
--   4. Set pieces.current_owner_id
--   5. Insert a 'claimed' provenance_events row
--   6. Mark the claim consumed
--
-- Returns JSON: { ok: bool, error?: text, piece_id?: uuid }.
-- All-or-nothing — any failure aborts the transaction and leaves the
-- DB unchanged.

create or replace function public.claim_piece(
  p_token text,
  p_user_id uuid,
  p_display_name text,
  p_country text
) returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_claim public.claims%rowtype;
  v_piece_id uuid;
  v_owner uuid;
begin
  -- Lock the claim row first.
  select * into v_claim from public.claims
    where token = p_token
    for update;
  if not found then
    return json_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_claim.consumed_at is not null then
    return json_build_object('ok', false, 'error', 'already_consumed');
  end if;
  if v_claim.expires_at < now() then
    return json_build_object('ok', false, 'error', 'expired');
  end if;

  -- Lock the piece and re-check current_owner_id under the lock.
  select id, current_owner_id into v_piece_id, v_owner
    from public.pieces
    where id = v_claim.piece_id
    for update;
  if not found then
    return json_build_object('ok', false, 'error', 'piece_not_found');
  end if;
  if v_owner is not null then
    return json_build_object('ok', false, 'error', 'already_claimed');
  end if;

  -- Populate profile fields the claimant provided. Only overwrite
  -- when the value is non-empty so a repeat claim doesn't wipe
  -- pre-existing profile data.
  update public.profiles
    set display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
        country = coalesce(nullif(p_country, ''), country)
    where id = p_user_id;

  -- Assign ownership.
  update public.pieces
    set current_owner_id = p_user_id
    where id = v_piece_id;

  -- Provenance event.
  insert into public.provenance_events (
    piece_id, event_type, from_owner_id, to_owner_id, notes
  ) values (
    v_piece_id, 'claimed', null, p_user_id, null
  );

  -- Mark claim consumed.
  update public.claims
    set consumed_at = now()
    where id = v_claim.id;

  return json_build_object('ok', true, 'piece_id', v_piece_id);
end;
$fn$;

revoke all on function public.claim_piece(text, uuid, text, text) from public;
grant execute on function public.claim_piece(text, uuid, text, text) to authenticated, service_role;

-- ===========================================================================
-- accept_transfer(p_token, p_user_id)
-- ===========================================================================
--
-- Atomically:
--   1. Lock + validate the transfer row (pending, not expired, email
--      matches the accepting user's auth email)
--   2. Lock the piece row and verify ownership hasn't drifted away
--      from from_owner_id since the transfer was created
--   3. Set pieces.current_owner_id = p_user_id
--   4. Insert a 'transferred' provenance_events row carrying the note
--   5. Mark the transfer accepted + record to_owner_id

create or replace function public.accept_transfer(
  p_token text,
  p_user_id uuid
) returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_transfer public.transfers%rowtype;
  v_piece_id uuid;
  v_owner uuid;
  v_user_email text;
begin
  -- Resolve the accepting user's email from auth.users.
  select email into v_user_email from auth.users where id = p_user_id;
  if v_user_email is null then
    return json_build_object('ok', false, 'error', 'invalid_user');
  end if;

  select * into v_transfer from public.transfers
    where token = p_token
    for update;
  if not found then
    return json_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_transfer.status <> 'pending' then
    return json_build_object('ok', false, 'error', v_transfer.status);
  end if;
  if v_transfer.expires_at < now() then
    update public.transfers set status = 'expired' where id = v_transfer.id;
    return json_build_object('ok', false, 'error', 'expired');
  end if;
  if lower(v_transfer.to_email) <> lower(v_user_email) then
    return json_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  select id, current_owner_id into v_piece_id, v_owner
    from public.pieces
    where id = v_transfer.piece_id
    for update;
  if not found then
    return json_build_object('ok', false, 'error', 'piece_not_found');
  end if;
  if v_owner is null or v_owner <> v_transfer.from_owner_id then
    -- Ownership drifted between create and accept; refuse.
    update public.transfers set status = 'revoked' where id = v_transfer.id;
    return json_build_object('ok', false, 'error', 'ownership_changed');
  end if;

  update public.pieces
    set current_owner_id = p_user_id
    where id = v_piece_id;

  insert into public.provenance_events (
    piece_id, event_type, from_owner_id, to_owner_id, notes
  ) values (
    v_piece_id, 'transferred', v_transfer.from_owner_id, p_user_id, v_transfer.note
  );

  update public.transfers
    set status = 'accepted',
        to_owner_id = p_user_id,
        accepted_at = now()
    where id = v_transfer.id;

  return json_build_object('ok', true, 'piece_id', v_piece_id);
end;
$fn$;

revoke all on function public.accept_transfer(text, uuid) from public;
grant execute on function public.accept_transfer(text, uuid) to authenticated, service_role;

-- ===========================================================================
-- expire_pending_transfers_and_claims()
-- ===========================================================================
--
-- Marks every pending transfer past its expires_at as 'expired'.
-- claims rows don't have a status column — once expires_at passes they
-- are simply rejected by claim_piece(); the rows stay for audit.
--
-- Idempotent; safe to call as often as you like. Used by the pg_cron
-- daily job below and callable from server code if you want eager
-- expiry (e.g. on a /me page load).

create or replace function public.expire_pending_transfers_and_claims()
returns integer
language plpgsql
as $fn$
declare
  v_count integer;
begin
  with expired as (
    update public.transfers
      set status = 'expired'
      where status = 'pending' and expires_at < now()
      returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$fn$;

grant execute on function public.expire_pending_transfers_and_claims() to service_role;

-- ===========================================================================
-- pg_cron daily expiry job (midnight UTC)
-- ===========================================================================
--
-- Requires pg_cron to be enabled in the Supabase dashboard:
--   Database → Extensions → pg_cron (toggle on)
--
-- If pg_cron isn't installed when this migration runs, we log a notice
-- and skip the scheduling block — the expiry function is still
-- callable manually or from server code, so the feature degrades to
-- "expiry on next /me page load" rather than failing the migration.

do $$
declare
  v_has_cron boolean;
begin
  select exists (
    select 1 from pg_available_extensions
    where name = 'pg_cron' and installed_version is not null
  ) into v_has_cron;

  if v_has_cron then
    -- Idempotent re-schedule: drop the existing job by name if any.
    begin
      perform cron.unschedule('phase5_expire_pending');
    exception when others then
      -- Job didn't exist; ignore.
      null;
    end;
    perform cron.schedule(
      'phase5_expire_pending',
      '0 0 * * *',
      'select public.expire_pending_transfers_and_claims();'
    );
    raise notice 'phase5: scheduled pg_cron job phase5_expire_pending (00:00 UTC daily)';
  else
    raise notice 'phase5: pg_cron not installed; call public.expire_pending_transfers_and_claims() manually or enable pg_cron in the Supabase dashboard';
  end if;
end $$;
