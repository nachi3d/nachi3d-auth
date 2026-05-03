-- Nachi3D Certify — seed data for local dev and E2E tests.
-- Loaded by `supabase db reset`. Idempotent via ON CONFLICT.
--
-- Two test users are seeded so Playwright can sign in and exercise
-- the admin gate without going through email magic links:
--
--   admin@nachi3d.test     → is_admin = true   (id ...010)
--   collector@nachi3d.test → is_admin = false  (id ...020)
--
-- Both share the password `nachi3d-test-password`. These credentials
-- live only in the local seed and must NEVER be reused on the hosted
-- Supabase project. The auth.users / auth.identities inserts work
-- against the local Supabase stack (`supabase start`) — they will
-- not run against a hosted instance via `supabase db push`.

-- ---------------------------------------------------------------------------
-- Admin test user
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at,
  confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000010',
  'authenticated', 'authenticated',
  'admin@nachi3d.test',
  crypt('nachi3d-test-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false, now(), now(),
  '', '', '', ''
)
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000010',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000010'::text,
    'email', 'admin@nachi3d.test',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  '00000000-0000-0000-0000-000000000010',
  now(), now(), now()
)
on conflict (provider, provider_id) do nothing;

-- The handle_new_user trigger created the profile row. Flip the admin flag.
update public.profiles
   set is_admin = true,
       display_name = 'Test Admin'
 where id = '00000000-0000-0000-0000-000000000010';

-- ---------------------------------------------------------------------------
-- Non-admin test user
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at,
  confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000020',
  'authenticated', 'authenticated',
  'collector@nachi3d.test',
  crypt('nachi3d-test-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false, now(), now(),
  '', '', '', ''
)
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000020',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000020'::text,
    'email', 'collector@nachi3d.test',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  '00000000-0000-0000-0000-000000000020',
  now(), now(), now()
)
on conflict (provider, provider_id) do nothing;

update public.profiles
   set display_name = 'Test Collector'
 where id = '00000000-0000-0000-0000-000000000020';

-- ---------------------------------------------------------------------------
-- One published piece used by Phase 1 verification specs.
-- The verification_token column is a placeholder; the runtime check
-- recomputes the HMAC from HMAC_SECRET + nfc_uid + piece_id and compares
-- to the URL's `t` parameter.
-- ---------------------------------------------------------------------------

insert into public.pieces (
  id, piece_number, edition_number, edition_total,
  nfc_uid, verification_token,
  character_name, character_quote,
  license_status, sculpt_date, paint_date,
  photos, status
) values (
  '00000000-0000-0000-0000-000000000001',
  1, 1, 10,
  '04A1B2C3D4E580',
  'placeholder-recomputed-at-runtime',
  'Test Subject',
  'Authenticity is what you carry, not what you claim.',
  'original',
  '2026-04-01', '2026-04-15',
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
