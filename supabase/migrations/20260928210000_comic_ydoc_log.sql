-- Real-time collaboration (plans/2026-09-28_realtime-collaboration.plan.md). A comic's
-- document becomes a Y.Doc: a compacted snapshot on the row (`ydoc`), plus an insert-only log
-- of updates (`comic_updates`). Writers only ever insert, so no write can lose another's work;
-- an insert trigger broadcasts each update to the comic's private Realtime channel.
-- `comics.doc` stays as a JSON projection (comics list, search), refreshed by compaction.

-- Who may open a comic. Owner-only for now; sharing replaces this body with a members check.
create function public.can_access_comic(comic uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.comics c where c.id = comic and c.owner_id = (select auth.uid())
  );
$$;

-- Null until the first open converts a pre-Yjs comic (see init_comic_ydoc).
alter table public.comics
  add column ydoc bytea,
  -- Bumped by every snapshot write, so compaction is compare-and-set.
  add column ydoc_rev integer not null default 0,
  -- The highest update id folded into the snapshot: with pending ids, a monotonic revision.
  add column ydoc_upto bigint not null default 0;

create table public.comic_updates (
  id bigint generated always as identity primary key,
  comic_id uuid not null references public.comics (id) on delete cascade,
  update bytea not null check (octet_length(update) < 5 * 1024 * 1024),
  author uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index comic_updates_comic_idx on public.comic_updates (comic_id, id);

alter table public.comic_updates enable row level security;

create policy "Members read updates" on public.comic_updates
  for select to authenticated using (public.can_access_comic(comic_id));
create policy "Members append updates" on public.comic_updates
  for insert to authenticated
  with check (public.can_access_comic(comic_id) and author = (select auth.uid()));
-- Only compaction deletes, and only rows already folded into the snapshot (compact_comic).
create policy "Members delete compacted updates" on public.comic_updates
  for delete to authenticated using (public.can_access_comic(comic_id));

create function public.comic_updates_broadcast() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Free-tier broadcasts cap at 256 KB and base64 inflates by 4/3: above 128 KB, send only a
  -- notice and let receivers fetch the row.
  perform realtime.send(
    case when octet_length(new.update) > 128 * 1024
      then jsonb_build_object('id', new.id, 'author', new.author, 'fetch', true)
      else jsonb_build_object(
        'id', new.id, 'author', new.author, 'update', encode(new.update, 'base64')
      )
    end,
    'update',
    'comic:' || new.comic_id::text,
    true
  );
  return null;
end;
$$;

create trigger comic_updates_broadcast
  after insert on public.comic_updates
  for each row execute function public.comic_updates_broadcast();

-- Private channel comic:<id>: members receive updates and exchange presence.
create policy "Members receive comic channel" on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'comic:%'
    and public.can_access_comic(substring(realtime.topic() from 7)::uuid)
  );
create policy "Members send on comic channel" on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'comic:%'
    and public.can_access_comic(substring(realtime.topic() from 7)::uuid)
  );

-- Whole-row change events would now carry a snapshot on every compaction; the update log
-- replaces them.
alter publication supabase_realtime drop table public.comics;

-- First open of a pre-Yjs comic: store its converted snapshot, unless someone beat us to it.
create function public.init_comic_ydoc(comic uuid, state bytea) returns boolean
language sql
set search_path = ''
as $$
  with done as (
    update public.comics set ydoc = state, ydoc_rev = 1
    where id = comic and ydoc is null
    returning 1
  )
  select exists (select 1 from done);
$$;

-- Fold applied updates into a new snapshot. Compare-and-set on ydoc_rev: the caller's state
-- must include the snapshot it started from, or it could drop what another compaction folded
-- in. Deletes exactly the rows the caller applied, so an update that committed late (with a
-- lower id) is never lost. Also refreshes the JSON projection and title.
create function public.compact_comic(
  comic uuid, base_rev integer, state bytea, applied bigint[], new_title text, projection jsonb
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.comics
    set ydoc = state, ydoc_rev = base_rev + 1, title = new_title, doc = projection,
      ydoc_upto = greatest(ydoc_upto, coalesce((select max(a) from unnest(applied) a), 0))
    where id = comic and ydoc_rev = base_rev;
  if not found then
    return false;
  end if;
  delete from public.comic_updates where comic_id = comic and id = any (applied);
  return true;
end;
$$;
