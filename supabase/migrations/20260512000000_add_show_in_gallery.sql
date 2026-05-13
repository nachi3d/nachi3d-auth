-- Phase 4 — public gallery
-- Add a piece-level visibility flag for /gallery. The public-read RLS
-- policy still gates on status='published'; the gallery query simply
-- adds `show_in_gallery = true` on top so individual pieces can be
-- hidden from the gallery while still resolving on /v/[uid].

alter table public.pieces
  add column if not exists show_in_gallery boolean not null default true;

-- Backfill any pre-existing rows whose column happens to be null. The
-- NOT NULL DEFAULT above means new rows already get `true`, but on a
-- replayed migration the explicit UPDATE is the safety net.
update public.pieces
  set show_in_gallery = true
  where show_in_gallery is null;

-- Gallery query: `where status = 'published' and show_in_gallery = true
-- order by piece_number desc`. Composite index covers the filter +
-- the sort in one go.
create index if not exists pieces_gallery_idx
  on public.pieces (status, show_in_gallery, piece_number desc);
