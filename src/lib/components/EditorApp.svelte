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
	import type { CloudDoc } from '$lib/persistence/cloud-doc';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import ShareDialog from './ShareDialog.svelte';
	import { Presence } from '$lib/collab/presence.svelte';
	import { colorFor, displayName } from '$lib/collab/hold';
	import type { DocumentSource } from '$lib/persistence/source';
	import { onMount, type Snippet } from 'svelte';
	import type { StyleSummary } from '$lib/styles/styles';
	import { DEFAULT_TYPOGRAPHY } from '$lib/typography/typography';
	import type { ModelOption } from '$lib/generation/models';

	/** A cloud comic (`cloud`, synced live through Yjs) or the local one (`source`). */
	let {
		source,
		cloud,
		sharing,
		initialPage = 1,
		nav,
		onrevoked,
		styles,
		models
	}: {
		source?: DocumentSource;
		cloud?: CloudDoc;
		/** Cloud comics: enables the Share dialog. */
		sharing?: { supabase: SupabaseClient; userId: string; email: string };
		initialPage?: number;
		nav?: Snippet;
		/** This user no longer has access (removed, or left). */
		onrevoked?: () => void;
		/** Cloud comics: the team's style profiles, for picking this comic's style. */
		styles?: StyleSummary[];
		/** Cloud comics: the image models this server can use. */
		models?: ModelOption[];
	} = $props();

	const gen = $derived(
		cloud && sharing && models
			? { comicId: cloud.id, supabase: sharing.supabase, models }
			: undefined
	);

	/** The lettering of this comic's style, or the house default. */
	const typography = $derived(
		styles?.find((s) => s.id === editor.comic.styleProfileId)?.typography ?? DEFAULT_TYPOGRAPHY
	);

	let sharingOpen = $state(false);
	function closeSharing() {
		sharingOpen = false;
		document.querySelector<HTMLElement>('[data-share]')?.focus();
	}
	import { downloadDataUrl, pageToPng, slug } from '$lib/export/png';
	import { resolveBands } from '$lib/model/bands';
	import { formatOf } from '$lib/model/factory';

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

	/** The printed sheet, from the first page's shape: A1 for boards, else US comic trim. */
	const sheet = $derived(
		editor.comic.pages[0] && formatOf(editor.comic.pages[0]) === 'board'
			? { width: '594mm', height: '841mm', px: (594 / 25.4) * 96 }
			: { width: '6.625in', height: '10.25in', px: 6.625 * 96 }
	);

	// @page can't take a CSS variable, so the print stylesheet's sheet size is written here.
	$effect(() => {
		const style = document.createElement('style');
		style.textContent = `@page { size: ${sheet.width} ${sheet.height}; margin: 0; }`;
		document.head.append(style);
		return () => style.remove();
	});
	let saveStatus = $state<SaveStatus>('saved');
	let loaded = $state(false);
	/** Receiving live updates (cloud comics only); exposed as data-live for tests. */
	let live = $state(false);

	// The local comic is saved whole, as JSON, after each change settles.
	const autosave = createAutoSave({
		getVersion: () => editor.version,
		serialize: () => serialize(editor.comic),
		save: (json) => source!.save(JSON.parse(json) as Comic),
		onStatus: (s) => (saveStatus = s)
	});

	async function openCloud(doc: CloudDoc) {
		doc.onstatus = (s) => (saveStatus = s);
		doc.onlive = (l) => (live = l);
		doc.onrevoked = () => onrevoked?.();
		editor.attach(await doc.open());
		if (sharing) {
			const presence = new Presence(editor.doc, {
				id: sharing.userId,
				name: displayName(sharing.email),
				color: colorFor(sharing.userId)
			});
			editor.presence = presence;
			doc.attachPresence(presence);
		}
		editor.goToPage(initialPage - 1);
		void doc.connect();
	}

	async function openLocal(local: DocumentSource) {
		const comic = await local.load();
		if (comic) editor.load(comic);
		editor.goToPage(initialPage - 1);
		autosave.markSaved();
	}

	onMount(() => {
		(cloud ? openCloud(cloud) : openLocal(source!))
			.catch((e) => editor.say(`Couldn't open the comic: ${e.message}`))
			.finally(() => (loaded = true));
		const onHide = () => {
			if (document.visibilityState !== 'hidden') return;
			if (cloud) void cloud.compact();
			else void autosave.saveNow();
		};
		document.addEventListener('visibilitychange', onHide);
		// Closing the tab: tell the others we left, rather than letting them time us out.
		const onPageHide = () => editor.presence?.destroy();
		window.addEventListener('pagehide', onPageHide);
		return () => {
			cloud?.destroy();
			document.removeEventListener('visibilitychange', onHide);
			window.removeEventListener('pagehide', onPageHide);
		};
	});

	// Publish where we are and what we have selected.
	$effect(() => {
		const sel = editor.selection;
		editor.presence?.set({
			page: editor.page?.id,
			selection: sel.kind === 'panels' ? [...sel.ids] : sel.kind === 'balloon' ? [sel.id] : []
		});
	});

	// Scheduled synchronously (not from an $effect a tick later), so the toolbar never shows
	// "Saved" while a change is still waiting to be written. Cloud comics send their own
	// changes as they happen (see CloudDoc).
	editor.onchange = () => {
		if (loaded && !cloud) autosave.schedule();
	};

	function onbeforeunload(e: BeforeUnloadEvent) {
		if (saveStatus === 'saved') return;
		if (cloud) void cloud.flush();
		else void autosave.saveNow();
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
		// A modal (the Share dialog) owns the keyboard: Esc closes it, typing is typing.
		if ((e.target as Element | null)?.closest?.('dialog')) return;
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
	{#if loaded}<PageView page={editor.page} scale={1} {typography} bands={editor.bands} />{/if}
</div>

<!-- Every page, one per sheet; only visible when printing (Export → PDF). -->
<div class="print-pages" aria-hidden="true">
	{#if loaded}
		{#each editor.comic.pages as page, i (page.id)}
			<div class="print-page" style:height={sheet.height}>
				<PageView
					{page}
					scale={sheet.px / page.width}
					{typography}
					bands={resolveBands(editor.comic, i)}
					linkable
				/>
			</div>
		{/each}
	{/if}
</div>

<div class="app flex h-screen flex-col bg-stone-100 text-stone-900">
	<Toolbar
		{editor}
		{saveStatus}
		onexportpng={exportPng}
		onexportpdf={exportPdf}
		onshare={cloud && sharing ? () => (sharingOpen = true) : undefined}
		{nav}
	/>
	{#if sharingOpen && cloud && sharing}
		<ShareDialog
			supabase={sharing.supabase}
			comicId={cloud.id}
			userId={sharing.userId}
			title={editor.comic.title}
			onclose={closeSharing}
			onleft={() => onrevoked?.()}
		/>
	{/if}
	<div class="flex min-h-0 flex-1">
		<PageStrip {editor} {typography} />
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
						<PageView page={editor.page} {scale} {editor} {typography} bands={editor.bands} />
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
		<Inspector {editor} {styles} {gen} />
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
