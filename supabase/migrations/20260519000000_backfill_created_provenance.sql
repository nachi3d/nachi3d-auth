-- Backfill missing 'created' provenance events.
--
-- Pre-Phase-5, seed-remote.ts inserted a 'created' provenance event
-- only for the canonical seed piece (#9001). Pieces seeded after that
-- (#9002, #9003) — and any pieces created via the admin form path that
-- did not also emit a 'created' event — never got one. The bug surfaced
-- after Phase 5 shipped: claiming #9003 made /v/[uid] show only
-- "Revendiquée" with no preceding "Créée" entry.
--
-- This backfill inserts a 'created' provenance event for every piece
-- that lacks one, anchored to pieces.created_at so the timeline reads
-- chronologically (Créée → Revendiquée → …) without us having to know
-- the original registration timestamp.
--
-- Idempotent by construction: the SELECT clause excludes any piece that
-- already has a 'created' row, so re-running the migration is a no-op.
--
-- No `notes` — a creation event needs no commentary, and the value would
-- otherwise surface as a subtitle on the public /v/[uid] timeline. Notes
-- are reserved for transfers and claims where they're semantically
-- meaningful.

insert into public.provenance_events (
  piece_id, event_type, occurred_at
)
select
  p.id,
  'created',
  p.created_at
from public.pieces p
where not exists (
  select 1 from public.provenance_events pe
  where pe.piece_id = p.id and pe.event_type = 'created'
);
