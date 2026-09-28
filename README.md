# Riverbanks

A comic book page maker: panel grids with arbitrary contiguous merges and break-out panels,
per-panel images (mostly AI-generated), and WYSIWYG captions, balloons and SFX.

SvelteKit 2 + Svelte 5, local-first (IndexedDB). See
[`plans/2026-09-28_comic-page-editor-v1.plan.md`](plans/2026-09-28_comic-page-editor-v1.plan.md).

```sh
npm install
npm run dev        # editor at http://localhost:5173
npm run test:unit  # vitest
npm run check      # svelte-check
```
