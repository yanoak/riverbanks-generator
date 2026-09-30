-- Style profiles and image generation (plans/2026-09-29_style-profiles-generation.plan.md).
-- A profile is reference images plus written style context that every generation in a comic
-- follows. Profiles are team-wide: every account reads and uses them, only the creator edits.

create table public.style_profiles (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null default 'Untitled style' check (char_length(name) between 1 and 120),
  style text not null default '' check (char_length(style) <= 4000),
  palette jsonb not null default '[]' check (jsonb_typeof(palette) = 'array'),
  avoid text not null default '' check (char_length(avoid) <= 1000),
  -- A key in the app's model registry; null means the app's default.
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.style_profiles_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.created_by := old.created_by; -- the creator never changes through an update
  return new;
end;
$$;

create trigger style_profiles_touch
  before update on public.style_profiles
  for each row execute function public.style_profiles_touch();

alter table public.style_profiles enable row level security;

create policy "Everyone reads styles" on public.style_profiles
  for select to authenticated using (true);
create policy "Anyone creates styles as themselves" on public.style_profiles
  for insert to authenticated with check ((select auth.uid()) = created_by);
create policy "Creators update their styles" on public.style_profiles
  for update to authenticated using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);
create policy "Creators delete their styles" on public.style_profiles
  for delete to authenticated using ((select auth.uid()) = created_by);

create function public.is_style_creator(profile uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.style_profiles p
    where p.id = profile and p.created_by = (select auth.uid())
  );
$$;

-- Creators' emails for "by …" (auth.users is not readable directly).
create function public.style_creators()
returns table (user_id uuid, email text)
language sql stable security definer
set search_path = ''
as $$
  select distinct u.id, u.email::text
  from public.style_profiles p join auth.users u on u.id = p.created_by
  where (select auth.uid()) is not null;
$$;

-- Reference images. The file is style-refs/<profile id>/<ref id>. The role tells the prompt
-- how to use the image; Gemini budgets style, character and object references separately.
create table public.style_refs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.style_profiles (id) on delete cascade,
  role text not null default 'style' check (role in ('style', 'character', 'object')),
  label text not null default '' check (char_length(label) <= 120),
  sort integer not null default 0,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now()
);

create index style_refs_profile_idx on public.style_refs (profile_id, sort);

alter table public.style_refs enable row level security;

create policy "Everyone reads style refs" on public.style_refs
  for select to authenticated using (true);
create policy "Creators add style refs" on public.style_refs
  for insert to authenticated with check (public.is_style_creator(profile_id));
create policy "Creators change style refs" on public.style_refs
  for update to authenticated using (public.is_style_creator(profile_id))
  with check (public.is_style_creator(profile_id));
create policy "Creators remove style refs" on public.style_refs
  for delete to authenticated using (public.is_style_creator(profile_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'style-refs', 'style-refs', false, 10 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
);

create function public.can_edit_style_folder(path text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  -- CASE, not AND: Postgres may evaluate AND's operands in any order, and the cast would fail.
  select case
    when (storage.foldername(path))[1] ~ '^[0-9a-f-]{36}$'
      then public.is_style_creator(((storage.foldername(path))[1])::uuid)
    else false
  end;
$$;

create policy "Everyone reads style ref files" on storage.objects
  for select to authenticated using (bucket_id = 'style-refs');
create policy "Creators upload style ref files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'style-refs' and public.can_edit_style_folder(name));
create policy "Creators replace style ref files" on storage.objects
  for update to authenticated
  using (bucket_id = 'style-refs' and public.can_edit_style_folder(name));
create policy "Creators delete style ref files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'style-refs' and public.can_edit_style_folder(name));

-- Every generation attempt: the takes history for a panel, and a record of what was spent.
-- The image itself is assets/<comic id>/<asset id>, like any other panel image.
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  comic_id uuid not null references public.comics (id) on delete cascade,
  panel_id text not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  profile_id uuid references public.style_profiles (id) on delete set null,
  model text not null,
  prompt text not null check (char_length(prompt) <= 4000),
  full_prompt text not null,
  aspect text not null,
  -- Drafts are small and cheap; a print version redraws a chosen image at 4K.
  quality text not null default 'draft' check (quality in ('draft', 'print')),
  -- For a print version, the image it was redrawn from.
  source_asset_id text,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  error text,
  asset_id text,
  width integer,
  height integer,
  -- The provider's job id (Higgsfield request_id), for chasing a slow or lost job.
  provider_ref text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index generations_panel_idx on public.generations (comic_id, panel_id, created_at desc);

alter table public.generations enable row level security;

create policy "Members read generations" on public.generations
  for select to authenticated using (public.can_access_comic(comic_id));
create policy "Members start generations" on public.generations
  for insert to authenticated
  with check (public.can_access_comic(comic_id) and created_by = (select auth.uid()));
-- Only the server finishing a request, acting as the person who started it.
create policy "Starters finish generations" on public.generations
  for update to authenticated
  using (created_by = (select auth.uid()) and public.can_access_comic(comic_id))
  with check (created_by = (select auth.uid()));

-- Generated panels come back as 2K PNGs, which can run past the original 10 MB.
update storage.buckets set file_size_limit = 25 * 1024 * 1024 where id = 'assets';
