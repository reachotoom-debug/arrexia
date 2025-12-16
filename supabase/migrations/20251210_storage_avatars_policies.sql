-- Create avatars bucket if it does not exist
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- RLS is already enabled on storage.objects by Supabase.
-- Don't call ALTER TABLE here; we don't own this table.

-- Public read for avatars (so the app can render them)
create policy "Avatars public read"
on storage.objects
for select
using (bucket_id = 'avatars');

-- Authenticated users can upload avatars
create policy "Avatars authenticated upload"
on storage.objects
for insert
with check (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
);

-- Authenticated users can update avatars
create policy "Avatars authenticated update"
on storage.objects
for update
using (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
)
with check (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
);

-- Authenticated users can delete avatars
create policy "Avatars authenticated delete"
on storage.objects
for delete
using (
  bucket_id = 'avatars'
  and auth.role() = 'authenticated'
);