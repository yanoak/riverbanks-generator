-- The story network: one canon document per network (just 'riverbook' for now), rebuilt from
-- the RIVERBOOK Google Doc by the riverbook-network skill and shown at /network. Anyone may
-- read it (the page is public); signed-in team members write it. Plan: 2026-10-01_story-network.

create table public.story_network (
  id text primary key check (char_length(id) between 1 and 60),
  data jsonb not null,
  synced_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid()
);

alter table public.story_network enable row level security;

create policy "Everyone reads story networks" on public.story_network
  for select to anon, authenticated using (true);
create policy "Signed-in users add story networks" on public.story_network
  for insert to authenticated with check (true);
create policy "Signed-in users change story networks" on public.story_network
  for update to authenticated using (true) with check (true);
