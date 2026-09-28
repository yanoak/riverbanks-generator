<script lang="ts">
	import Inspector from '$lib/components/Inspector.svelte';
	import PageStrip from '$lib/components/PageStrip.svelte';
	import PageView from '$lib/components/PageView.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import { Editor } from '$lib/editor/editor.svelte';
	import { handleShortcut } from '$lib/editor/shortcuts';
	import { serialize } from '$lib/model/serialize';
	import type { Comic } from '$lib/model/types';
	import { createAutoSave, type SaveStatus } from '$lib/persistence/autosave';
	import type { DocumentSource } from '$lib/persistence/source';
	import { onMount, tick, type Snippet } from 'svelte';

	let {
		source,
		initialPage = 1,
		nav
	}: { source: DocumentSource; initialPage?: number; nav?: Snippet } = $props();
	import { downloadDataUrl, pageToPng, slug } from '$lib/export/png';

	/** US trim width at 96 CSS px per inch, for the print stylesheet. */
	const PRINT_SCALE = (6.625 * 96) / 1000;
	let stage = $state<HTMLElement>();

	async function exportPng() {
		const node = stage?.firstElementChild as HTMLElement | null;
		if (!node) return;
		editor.say('Rendering PNG…');
		try {
			const url = await pageToPng(node);
			downloadDataUrl(url, `${slug(editor.comic.title)}-page-${editor.pageIndex + 1}.png`);
			editor.say(null);
		} catch (e) {
			editor.say(`PNG export failed: ${(e as Error).message}`);
		}
	}

	function exportPdf() {
		editor.select({ kind: 'none' });
		window.print();
	}

	const editor = new Editor();
	let saveStatus = $state<SaveStatus>('saved');
	let loaded = $state(false);
	/** Receiving live updates (cloud comics only); exposed as data-live for tests. */
	let live = $state(false);

	const autosave = createAutoSave({
		getVersion: () => editor.version,
		serialize: () => serialize(editor.comic),
		save: (json) => source.save(JSON.parse(json) as Comic),
		onStatus: (s) => (saveStatus = s)
	});

	/** Show a newer copy (reload / remote update) without losing the user's place. */
	function adopt(comic: Comic) {
		const page = editor.pageIndex;
		editor.load(comic);
		editor.pageIndex = Math.min(page, comic.pages.length - 1);
		autosave.markSaved();
	}

	/** A newer copy arrived while there were unsaved edits here. */
	let conflict = $state(false);
	let banner = $state<HTMLElement>();

	async function showConflict() {
		conflict = true;
		await tick();
		banner?.focus();
	}

	$effect(() => {
		if (saveStatus === 'conflict' && !conflict) showConflict();
	});

	async function resolve(choice: 'reload' | 'keep') {
		try {
			if (choice === 'reload' && source.reload) adopt(await source.reload());
			if (choice === 'keep' && source.overwrite) {
				await source.overwrite(editor.comic);
				autosave.markSaved();
			}
			conflict = false;
			autosave.resume();
			document.querySelector<HTMLElement>('[data-canvas]')?.focus();
		} catch (e) {
			editor.say((e as Error).message);
		}
	}

	onMount(() => {
		source
			.load()
			.then((comic) => {
				if (comic) editor.load(comic);
				editor.goToPage(initialPage - 1);
			})
			.catch((e) => editor.say(`Couldn't open the comic: ${e.message}`))
			.finally(() => {
				autosave.markSaved();
				loaded = true;
			});
		const stopWatching = source.watch?.(
			(comic) => {
				if (saveStatus === 'saved') adopt(comic);
				else showConflict();
			},
			() => (live = true)
		);
		const onHide = () => document.visibilityState === 'hidden' && autosave.saveNow();
		document.addEventListener('visibilitychange', onHide);
		return () => {
			stopWatching?.();
			document.removeEventListener('visibilitychange', onHide);
		};
	});

	// Scheduled synchronously (not from an $effect a tick later), so the toolbar never shows
	// "Saved" while a change is still waiting to be written.
	editor.onchange = () => {
		if (loaded) autosave.schedule();
	};

	function onbeforeunload(e: BeforeUnloadEvent) {
		if (saveStatus === 'saved') return;
		autosave.saveNow();
		e.preventDefault(); // the browser's "changes may not be saved" prompt
	}

	let viewportWidth = $state(0);
	let viewportHeight = $state(0);
	const PAD = 48;
	const fit = $derived(
		Math.max(
			0.05,
			Math.min(
				(viewportWidth - PAD * 2) / editor.page.width,
				(viewportHeight - PAD * 2) / editor.page.height
			)
		)
	);
	const scale = $derived(editor.zoom ?? fit);

	/**
	 * Track the canvas viewport size. Measure once up front as well: ResizeObserver callbacks
	 * are not delivered while the tab is hidden, which left fit-to-view at its 5% floor.
	 */
	function measure(node: HTMLElement) {
		const read = () => {
			viewportWidth = node.clientWidth;
			viewportHeight = node.clientHeight;
		};
		read();
		const ro = new ResizeObserver(read);
		ro.observe(node);
		return () => ro.disconnect();
	}

	function onkeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
			e.preventDefault();
			exportPng();
			return;
		}
		if (handleShortcut(editor, e, fit)) e.preventDefault();
	}

	function onpaste(e: ClipboardEvent) {
		const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
		const [panel] = editor.selectedPanels;
		if (!file || !panel || editor.selectedPanels.length !== 1) return;
		e.preventDefault();
		editor.setImage(panel.id, file);
	}

	function onCanvasPointerDown(e: PointerEvent) {
		// Clicking the desk (outside the page's panels) clears the selection.
		if (e.target === e.currentTarget) editor.select({ kind: 'none' });
	}
</script>

<svelte:head><title>{editor.comic.title} — Riverbanks</title></svelte:head>
<svelte:window {onkeydown} {onpaste} {onbeforeunload} />

<!-- Offscreen static render of the current page at 1 unit = 1px, for PNG export. -->
<div class="export-stage" bind:this={stage} aria-hidden="true">
	{#if loaded}<PageView page={editor.page} scale={1} />{/if}
</div>

<!-- Every page, one per sheet; only visible when printing (Export → PDF). -->
<div class="print-pages" aria-hidden="true">
	{#if loaded}
		{#each editor.comic.pages as page (page.id)}
			<div class="print-page"><PageView {page} scale={PRINT_SCALE} /></div>
		{/each}
	{/if}
</div>

<div class="app flex h-screen flex-col bg-stone-100 text-stone-900">
	<Toolbar {editor} {saveStatus} onexportpng={exportPng} onexportpdf={exportPdf} {nav} />
	{#if conflict}
		<div
			bind:this={banner}
			class="flex items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 outline-none"
			role="alert"
			tabindex="-1"
		>
			<span class="flex-1">
				This comic was changed elsewhere (for example by an AI agent) while you had unsaved edits.
			</span>
			<button class="rounded bg-amber-900 px-3 py-1 text-white" onclick={() => resolve('reload')}>
				Reload theirs
			</button>
			<button class="rounded border border-amber-900 px-3 py-1" onclick={() => resolve('keep')}>
				Keep mine
			</button>
		</div>
	{/if}
	<div class="flex min-h-0 flex-1">
		<PageStrip {editor} />
		<main class="relative min-w-0 flex-1 overflow-auto" {@attach measure}>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				data-canvas
				data-ready={loaded}
				data-live={live}
				class="flex min-h-full min-w-full items-center justify-center outline-none"
				style:padding="{PAD}px"
				style:width="max-content"
				role="application"
				aria-label="Page {editor.pageIndex + 1} canvas"
				tabindex="0"
				onpointerdown={onCanvasPointerDown}
			>
				<div class="shadow-[0_2px_24px_rgba(0,0,0,0.12)]">
					{#if loaded}
						<PageView page={editor.page} {scale} {editor} />
					{/if}
				</div>
			</div>
			<div
				class="fixed right-68 bottom-3 flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs text-stone-600 shadow"
			>
				<button class="zoom" aria-label="Zoom out" onclick={() => editor.zoomBy(1 / 1.2, fit)}
					>−</button
				>
				<span class="w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
				<button class="zoom" aria-label="Zoom in" onclick={() => editor.zoomBy(1.2, fit)}>+</button>
				<button class="zoom px-2" onclick={() => (editor.zoom = null)}>Fit</button>
			</div>
		</main>
		<Inspector {editor} />
	</div>
</div>

<style lang="postcss">
	@reference "../../routes/layout.css";
	.export-stage {
		position: fixed;
		left: -100000px;
		top: 0;
		pointer-events: none;
	}
	.print-pages {
		display: none;
	}
	@media print {
		@page {
			size: 6.625in 10.25in;
			margin: 0;
		}
		:global(body) {
			margin: 0;
		}
		.app,
		.export-stage {
			display: none !important;
		}
		.print-pages {
			display: block;
		}
		.print-page {
			height: 10.25in;
			overflow: hidden;
		}
		.print-page:not(:last-child) {
			break-after: page;
		}
	}
	.zoom {
		@apply grid h-6 min-w-6 place-items-center rounded-full hover:bg-stone-100;
	}
</style>
