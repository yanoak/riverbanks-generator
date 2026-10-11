-- Thumbnails (plans/2026-10-11_comic-thumbnails.plan.md) live at assets/<comic id>/thumb-<key>.webp
-- and are replaced whenever page 1 changes. Members may delete those files and no others: a
-- comic's images stay undeletable, as before.
create policy "Members replace comic thumbnails" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assets'
    and storage.filename(name) ~ '^thumb-[0-9a-f]+\.webp$'
    and public.can_access_comic_folder(name)
  );
