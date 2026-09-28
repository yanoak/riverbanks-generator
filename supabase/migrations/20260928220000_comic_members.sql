-- Sharing (plans/2026-09-28_realtime-collaboration.plan.md, stage 2). A comic has members: its
-- owner and the editors they invite by email. Every member can open and edit it; only the owner
-- invites, removes and deletes. Images move to a per-comic folder so members can load them.

create type public.comic_role as enum ('owner', 'editor');

create table public.comic_members (
  comic_id uuid not null references public.comics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.comic_role not null default 'editor',
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (comic_id, user_id)
);

create index comic_members_user_idx on public.comic_members (user_id);

insert into public.comic_members (comic_id, user_id, role, added_by)
select id, owner_id, 'owner', owner_id from public.comics;

-- The creator becomes the owner member.
create function public.comics_add_owner() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.comic_members (comic_id, user_id, role, added_by)
  values (new.id, new.owner_id, 'owner', new.owner_id);
  return null;
end;
$$;

create trigger comics_add_owner
  after insert on public.comics
  for each row execute function public.comics_add_owner();

-- Membership now decides access everywhere can_access_comic is used (update log, channel).
create or replace function public.can_access_comic(comic uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.comic_members m
    where m.comic_id = comic and m.user_id = (select auth.uid())
  );
$$;

create function public.is_comic_owner(comic uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.comic_members m
    where m.comic_id = comic and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Members read and edit (compaction writes the snapshot, title and projection); the owner row
-- check stays for insert/returning, which runs before the owner member row exists.
drop policy "Owners read their comics" on public.comics;
drop policy "Owners update their comics" on public.comics;
create policy "Members read comics" on public.comics
  for select to authenticated
  using ((select auth.uid()) = owner_id or public.can_access_comic(id));
create policy "Members update comics" on public.comics
  for update to authenticated
  using (public.can_access_comic(id)) with check (public.can_access_comic(id));

alter table public.comic_members enable row level security;
-- Members see who else is on a comic; changes go through the functions below only.
create policy "Members see members" on public.comic_members
  for select to authenticated using (public.can_access_comic(comic_id));

-- People on a comic, with emails (auth.users is not readable directly).
create function public.comic_people(comic uuid)
returns table (user_id uuid, email text, role public.comic_role)
language sql stable security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role
  from public.comic_members m join auth.users u on u.id = m.user_id
  where m.comic_id = comic and public.can_access_comic(comic)
  order by m.role, m.created_at;
$$;

-- Owners of the comics shared with the caller (for "Shared with me · by …").
create function public.shared_comic_owners()
returns table (comic_id uuid, email text)
language sql stable security definer
set search_path = ''
as $$
  select c.id, u.email::text
  from public.comic_members me
  join public.comics c on c.id = me.comic_id
  join auth.users u on u.id = c.owner_id
  where me.user_id = (select auth.uid()) and me.role = 'editor';
$$;

-- Owner only. Accounts are admin-created, so an unknown email is an error, not an invitation.
create function public.invite_to_comic(comic uuid, invitee_email text)
returns table (user_id uuid, email text, role public.comic_role)
language plpgsql security definer
set search_path = ''
as $$
declare
  invitee uuid;
begin
  if not public.is_comic_owner(comic) then
    raise exception 'Only the owner can invite people.' using errcode = '42501';
  end if;
  select u.id into invitee from auth.users u where lower(u.email) = lower(trim(invitee_email));
  if invitee is null then
    raise exception 'No Riverbanks account with that email.' using errcode = 'P0002';
  end if;
  insert into public.comic_members (comic_id, user_id, role, added_by)
  values (comic, invitee, 'editor', (select auth.uid()))
  on conflict on constraint comic_members_pkey do nothing;
  return query select * from public.comic_people(comic) p where p.user_id = invitee;
end;
$$;

-- The owner removes an editor, or an editor leaves. The owner cannot be removed.
create function public.remove_from_comic(comic uuid, member uuid) returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (public.is_comic_owner(comic) or member = (select auth.uid())) then
    raise exception 'Only the owner can remove people.' using errcode = '42501';
  end if;
  delete from public.comic_members m
  where m.comic_id = comic and m.user_id = member and m.role = 'editor';
  return found;
end;
$$;

-- Images per comic: assets/<comic id>/<asset id>, for every member. The per-user folders stay
-- readable by their owner, so older images can be copied across on the owner's next open.
create function public.can_access_comic_folder(path text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  -- CASE, not AND: Postgres may evaluate AND's operands in any order, and the cast would fail.
  select case
    when (storage.foldername(path))[1] ~ '^[0-9a-f-]{36}$'
      then public.can_access_comic(((storage.foldername(path))[1])::uuid)
    else false
  end;
$$;

create policy "Members read comic assets" on storage.objects
  for select to authenticated
  using (bucket_id = 'assets' and public.can_access_comic_folder(name));
create policy "Members upload comic assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assets' and public.can_access_comic_folder(name));

-- Revisions reported to agents: a count of updates (folded + pending), continuing from the
-- pre-Yjs row revision so no comic's revision ever goes backwards.
update public.comics set ydoc_upto = greatest(ydoc_upto, rev);

create or replace function public.init_comic_ydoc(comic uuid, state bytea) returns boolean
language sql
set search_path = ''
as $$
  with done as (
    update public.comics set ydoc = state, ydoc_rev = 1, ydoc_upto = rev
    where id = comic and ydoc is null
    returning 1
  )
  select exists (select 1 from done);
$$;

create or replace function public.compact_comic(
  comic uuid, base_rev integer, state bytea, applied bigint[], new_title text, projection jsonb
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  folded integer;
begin
  update public.comics
    set ydoc = state, ydoc_rev = base_rev + 1, title = new_title, doc = projection
    where id = comic and ydoc_rev = base_rev;
  if not found then
    return false;
  end if;
  delete from public.comic_updates where comic_id = comic and id = any (applied);
  get diagnostics folded = row_count;
  update public.comics set ydoc_upto = ydoc_upto + folded where id = comic;
  return true;
end;
$$;
