-- Public copies of the cast portraits the story network shows. /network is public but styles are
-- not, so saving a network copies each named portrait here (plan 2026-10-01_network-portraits).
-- Files live at network-portraits/<network id>/<cast member id>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'network-portraits', 'network-portraits', true, 10 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp']
);

create policy "Signed-in users publish network portraits" on storage.objects
  for insert to authenticated with check (bucket_id = 'network-portraits');
create policy "Signed-in users replace network portraits" on storage.objects
  for update to authenticated using (bucket_id = 'network-portraits')
  with check (bucket_id = 'network-portraits');
create policy "Signed-in users read network portraits" on storage.objects
  for select to authenticated using (bucket_id = 'network-portraits');
