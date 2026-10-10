-- Archive (plans/2026-10-10_comic-archive.plan.md). An archived comic leaves the list and search
-- but is kept; only an archived comic can be deleted, so no one deletes a live comic in one step.

alter table public.comics add column archived_at timestamptz;

create index comics_archived_idx on public.comics (archived_at) where archived_at is not null;

-- Only the owner archives or restores (members may update the row, so RLS cannot say this).
-- Archiving is not an edit: it leaves rev and updated_at alone, so a restored comic keeps its
-- place. The store writes archived_at on its own. Signed-out callers (service role, SQL editor)
-- are let through for admin clean-up.
create or replace function public.comics_bump_rev() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner_id := old.owner_id; -- ownership never changes through an update
  if new.archived_at is distinct from old.archived_at then
    if (select auth.uid()) is not null and not public.is_comic_owner(old.id) then
      raise exception 'Only the owner can archive or restore a comic.' using errcode = '42501';
    end if;
    return new;
  end if;
  new.rev := old.rev + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop policy "Owners delete their comics" on public.comics;
create policy "Owners delete archived comics" on public.comics
  for delete to authenticated
  using ((select auth.uid()) = owner_id and archived_at is not null);
