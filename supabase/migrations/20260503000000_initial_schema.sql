-- Nachi3D Certify — initial schema
-- Tables: profiles, pieces, provenance_events, verification_logs
-- All tables have RLS enabled. Public read is gated by status='published'.

create extension if not exists "pgcrypto";

-- ===========================================================================
-- profiles
-- ===========================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  country text check (country is null or char_length(country) = 2),
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_is_admin_idx
  on public.profiles (is_admin)
  where is_admin = true;

-- Auto-create a profile row when a new auth.users row is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ===========================================================================
-- pieces
-- ===========================================================================

create table if not exists public.pieces (
  id uuid primary key default gen_random_uuid(),
  piece_number integer not null unique check (piece_number > 0),
  edition_number integer check (edition_number is null or edition_number > 0),
  edition_total integer check (edition_total is null or edition_total > 0),
  nfc_uid text not null unique,
  verification_token text not null,
  character_name text not null,
  character_quote text,
  license_status text not null
    check (license_status in ('original','public_domain','commission','licensed','other')),
  license_notes text,
  sculpt_date date not null,
  paint_date date not null,
  photos text[] not null default '{}',
  current_owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pieces_edition_pair_check check (
    (edition_number is null and edition_total is null)
    or (edition_number is not null and edition_total is not null
        and edition_number <= edition_total)
  )
);

create index if not exists pieces_nfc_uid_idx on public.pieces (nfc_uid);
create index if not exists pieces_piece_number_idx on public.pieces (piece_number);
create index if not exists pieces_status_idx on public.pieces (status);
create index if not exists pieces_current_owner_idx on public.pieces (current_owner_id);

-- ===========================================================================
-- provenance_events
-- ===========================================================================

create table if not exists public.provenance_events (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces(id) on delete cascade,
  event_type text not null
    check (event_type in ('created','claimed','transferred','note')),
  from_owner_id uuid references public.profiles(id) on delete set null,
  to_owner_id uuid references public.profiles(id) on delete set null,
  notes text,
  occurred_at timestamptz not null default now()
);

create index if not exists provenance_events_piece_id_idx
  on public.provenance_events (piece_id);
create index if not exists provenance_events_occurred_at_idx
  on public.provenance_events (occurred_at desc);

-- ===========================================================================
-- verification_logs
-- ===========================================================================

create table if not exists public.verification_logs (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.pieces(id) on delete cascade,
  ip_country text,
  ip_region text,
  user_agent text,
  is_owner boolean not null default false,
  occurred_at timestamptz not null default now()
);

create index if not exists verification_logs_piece_id_idx
  on public.verification_logs (piece_id);
create index if not exists verification_logs_occurred_at_idx
  on public.verification_logs (occurred_at desc);

-- ===========================================================================
-- updated_at triggers
-- ===========================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists pieces_set_updated_at on public.pieces;
create trigger pieces_set_updated_at
  before update on public.pieces
  for each row execute procedure public.set_updated_at();

-- ===========================================================================
-- RLS
-- ===========================================================================

alter table public.profiles enable row level security;
alter table public.pieces enable row level security;
alter table public.provenance_events enable row level security;
alter table public.verification_logs enable row level security;

-- profiles
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- pieces: anyone (anon + authenticated) can read published pieces;
-- only admins write. Service role bypasses RLS.
drop policy if exists pieces_select_published on public.pieces;
create policy pieces_select_published on public.pieces
  for select using (status = 'published');

drop policy if exists pieces_select_admin on public.pieces;
create policy pieces_select_admin on public.pieces
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists pieces_admin_write on public.pieces;
create policy pieces_admin_write on public.pieces
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- provenance_events: public read iff parent piece is published; admin write.
drop policy if exists provenance_events_select_published on public.provenance_events;
create policy provenance_events_select_published on public.provenance_events
  for select using (
    exists (
      select 1 from public.pieces p
      where p.id = provenance_events.piece_id and p.status = 'published'
    )
  );

drop policy if exists provenance_events_admin_write on public.provenance_events;
create policy provenance_events_admin_write on public.provenance_events
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  ) with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- verification_logs: admin-only read. Inserts go through the service-role
-- client (which bypasses RLS). No INSERT/UPDATE/DELETE policies for anon
-- or authenticated roles — those operations are denied by default.
drop policy if exists verification_logs_select_admin on public.verification_logs;
create policy verification_logs_select_admin on public.verification_logs
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
