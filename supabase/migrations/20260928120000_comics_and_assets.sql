-- Comics: one row per comic, the whole document as JSONB (the app's serialized Comic).
-- rev is bumped by trigger on every update; writers send "where rev = <expected>" so a stale
-- save (e.g. the editor after an MCP edit) matches zero rows instead of overwriting.

create table public.comics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Untitled comic' check (char_length(title) between 1 and 200),
  doc jsonb not null check (pg_column_size(doc) < 5 * 1024 * 1024),
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comics_owner_updated_idx on public.comics (owner_id, updated_at desc);

create function public.comics_bump_rev() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rev := old.rev + 1;
  new.updated_at := now();
  new.owner_id := old.owner_id; -- ownership never changes through an update
  return new;
end;
$$;

create trigger comics_bump_rev
  before update on public.comics
  for each row execute function public.comics_bump_rev();

alter table public.comics enable row level security;

create policy "Owners read their comics" on public.comics
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners create comics" on public.comics
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Owners update their comics" on public.comics
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Owners delete their comics" on public.comics
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- Live updates in the editor when another client (the MCP server) writes.
alter publication supabase_realtime add table public.comics;

-- Images: private bucket, objects at <user id>/<asset id>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assets', 'assets', false, 10 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
);

create policy "Users read their assets" on storage.objects
  for select to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload their assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users replace their assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete their assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
