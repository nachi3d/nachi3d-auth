-- Phase 5-prep — data safety
--
-- Test fixtures and production data currently share one Supabase project
-- (see "Data safety" in CLAUDE.md). The seed script's prune step used to
-- delete every piece whose UUID was not in a hard-coded seed list, which
-- meant every Playwright run wiped operator-created rows on the same DB.
--
-- This column is the semantic safety net: only rows explicitly marked
-- is_fixture = true can ever be deleted by the seed prune. Real operator
-- pieces (default false) are structurally safe even if the env guard
-- around the prune is bypassed. is_fixture is set ONLY by the
-- service-role seed script — no admin form, no public API, no zod schema
-- exposes it.

alter table public.pieces
  add column if not exists is_fixture boolean not null default false;

-- Backfill: the three canonical seed-piece UUIDs become fixtures so
-- replaying this migration on a database that already carries them
-- preserves the prune contract. Any other pre-existing row stays
-- is_fixture = false (real piece, untouchable by the seeder).
update public.pieces
  set is_fixture = true
  where id in (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003'
  );

-- Partial index — the seed prune query is
--   delete from pieces where is_fixture = true and id not in (...)
-- so only the true rows ever need to be looked up by this filter. A
-- partial index keeps the index tiny (handful of fixture rows) and
-- never touches the much larger set of real pieces.
create index if not exists pieces_fixture_idx
  on public.pieces (id)
  where is_fixture = true;
