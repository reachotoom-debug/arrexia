-- Allow authenticated users to upload workspace logos
create policy "authenticated can insert workspace logos"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'workspace-logos');

-- Allow authenticated users to view workspace logos
create policy "authenticated can select workspace logos"
on storage.objects
for select
to authenticated
using (bucket_id = 'workspace-logos');

-- (optional but useful) allow updates
create policy "authenticated can update workspace logos"
on storage.objects
for update
to authenticated
using (bucket_id = 'workspace-logos')
with check (bucket_id = 'workspace-logos');

-- (optional) allow deletes
create policy "authenticated can delete workspace logos"
on storage.objects
for delete
to authenticated
using (bucket_id = 'workspace-logos');
