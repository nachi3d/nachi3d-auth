-- Storage bucket for figurine photos.
-- Public read so verification pages can load images via the CDN URL.
-- Admin-only write/update/delete; defence-in-depth on top of the
-- service-role uploads done by the admin server actions.

insert into storage.buckets (id, name, public)
values ('piece-photos', 'piece-photos', true)
on conflict (id) do update set public = excluded.public;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects, scoped to bucket_id = 'piece-photos'.
-- Note: storage.objects has RLS enabled by Supabase; we add named policies
-- per operation so we can drop them cleanly in future migrations.
-- ---------------------------------------------------------------------------

drop policy if exists "piece_photos_public_read" on storage.objects;
create policy "piece_photos_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'piece-photos');

drop policy if exists "piece_photos_admin_insert" on storage.objects;
create policy "piece_photos_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'piece-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "piece_photos_admin_update" on storage.objects;
create policy "piece_photos_admin_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'piece-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    bucket_id = 'piece-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "piece_photos_admin_delete" on storage.objects;
create policy "piece_photos_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'piece-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
