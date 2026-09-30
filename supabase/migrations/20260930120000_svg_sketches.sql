-- SVG sketches (plans/2026-09-30_svg-sketches.plan.md). Sketches are stored as SVG, sanitised
-- on the server before upload; panels show them through <img>, which never runs scripts.
update storage.buckets
set allowed_mime_types = array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'
]
where id = 'assets';
