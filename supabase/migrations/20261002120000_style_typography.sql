-- A style's lettering: one font per balloon type ({speech: {family, weight, italic, uppercase},
-- …}). Holds only the types the creator changed; the app fills the rest from the house default
-- (typography/typography.ts). Plan: 2026-10-02_style-typography.

alter table public.style_profiles
  add column typography jsonb not null default '{}'::jsonb
    check (jsonb_typeof(typography) = 'object' and pg_column_size(typography) <= 4096);
