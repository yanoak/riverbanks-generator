-- A style's cast: named characters, props and places, each with a written description and
-- portrait images. Portraits are style_refs rows pointing at their member (cast_id); refs with
-- no cast_id are style references. Plan: 2026-10-01_style-cast.

create table public.style_cast (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.style_profiles (id) on delete cascade,
  kind text not null default 'character' check (kind in ('character', 'object', 'place')),
  name text not null default '' check (char_length(name) <= 120),
  aliases text[] not null default '{}' check (cardinality(aliases) <= 20),
  description text not null default '' check (char_length(description) <= 2000),
  sort integer not null default 0,
  -- The portrait sent with panels; null means the member's first one.
  portrait_id uuid,
  created_at timestamptz not null default now()
);

create index style_cast_profile_idx on public.style_cast (profile_id, sort);

alter table public.style_cast enable row level security;

create policy "Everyone reads style cast" on public.style_cast
  for select to authenticated using (true);
create policy "Creators add style cast" on public.style_cast
  for insert to authenticated with check (public.is_style_creator(profile_id));
create policy "Creators change style cast" on public.style_cast
  for update to authenticated using (public.is_style_creator(profile_id))
  with check (public.is_style_creator(profile_id));
create policy "Creators remove style cast" on public.style_cast
  for delete to authenticated using (public.is_style_creator(profile_id));

alter table public.style_refs
  add column cast_id uuid references public.style_cast (id) on delete cascade;
create index style_refs_cast_idx on public.style_refs (cast_id);

alter table public.style_cast
  add constraint style_cast_portrait_fk
  foreign key (portrait_id) references public.style_refs (id) on delete set null;

-- Which members a generation attached, for tracing an image back to its cast.
alter table public.generations add column cast_ids uuid[] not null default '{}';

-- Backfill: each labelled character/object reference becomes a member of that name (one member
-- per distinct name), and its portrait. Unlabelled ones were only ever style in practice.
-- The name is spelled as on the earliest reference that carries it.
insert into public.style_cast (profile_id, kind, name, sort)
select profile_id, role, (array_agg(btrim(label) order by sort))[1], min(sort)
from public.style_refs
where role in ('character', 'object') and btrim(label) <> ''
group by profile_id, role, lower(btrim(label));

update public.style_refs r
set cast_id = c.id
from public.style_cast c
where r.role in ('character', 'object')
  and r.cast_id is null
  and c.profile_id = r.profile_id
  and c.kind = r.role
  and lower(c.name) = lower(btrim(r.label));

update public.style_refs set role = 'style' where cast_id is null and role <> 'style';
