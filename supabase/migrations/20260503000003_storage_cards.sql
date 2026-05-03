-- Storage bucket for generated certificate-card PDFs.
-- Public read so an admin can share a download link without proxying.
-- Admin-only write/update/delete; the API route uploads via service role.

insert into storage.buckets (id, name, public)
values ('cards', 'cards', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "cards_public_read" on storage.objects;
create policy "cards_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'cards');

drop policy if exists "cards_admin_insert" on storage.objects;
create policy "cards_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'cards'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "cards_admin_update" on storage.objects;
create policy "cards_admin_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'cards'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    bucket_id = 'cards'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "cards_admin_delete" on storage.objects;
create policy "cards_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'cards'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
