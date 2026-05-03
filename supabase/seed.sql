-- Nachi3D Certify — seed data for local dev and E2E tests.
-- Loaded by `supabase db reset`. Idempotent via ON CONFLICT.

-- A single published piece used by Playwright E2E tests.
-- The verification_token column is a placeholder here; the actual
-- runtime check recomputes the HMAC from HMAC_SECRET + nfc_uid + piece_id
-- and compares to the URL's `t` parameter.
insert into public.pieces (
  id,
  piece_number,
  edition_number,
  edition_total,
  nfc_uid,
  verification_token,
  character_name,
  character_quote,
  license_status,
  sculpt_date,
  paint_date,
  photos,
  status
) values (
  '00000000-0000-0000-0000-000000000001',
  1,
  1,
  10,
  '04A1B2C3D4E580',
  'placeholder-recomputed-at-runtime',
  'Test Subject',
  'Authenticity is what you carry, not what you claim.',
  'original',
  '2026-04-01',
  '2026-04-15',
  array[]::text[],
  'published'
)
on conflict (id) do update set
  piece_number = excluded.piece_number,
  edition_number = excluded.edition_number,
  edition_total = excluded.edition_total,
  nfc_uid = excluded.nfc_uid,
  character_name = excluded.character_name,
  character_quote = excluded.character_quote,
  license_status = excluded.license_status,
  sculpt_date = excluded.sculpt_date,
  paint_date = excluded.paint_date,
  status = excluded.status;

insert into public.provenance_events (piece_id, event_type, notes)
values (
  '00000000-0000-0000-0000-000000000001',
  'created',
  'Initial registration (seed data).'
)
on conflict do nothing;
