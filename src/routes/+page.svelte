<script lang="ts">
	import Inspector from '$lib/components/Inspector.svelte';
	import PageStrip from '$lib/components/PageStrip.svelte';
	import PageView from '$lib/components/PageView.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import { Editor } from '$lib/editor/editor.svelte';
	import { handleShortcut } from '$lib/editor/shortcuts';
	import { deserialize, serialize } from '$lib/model/serialize';
	import { createAutoSave, type SaveStatus } from '$lib/persistence/autosave';
	import { loadDocument, saveDocument } from '$lib/persistence/documents';
	import { onMount } from 'svelte';

	const editor = new Editor();
	let saveStatus = $state<SaveStatus>('saved');
	let loaded = $state(false);

	const autosave = createAutoSave({
		getVersion: () => editor.version,
		serialize: () => serialize(editor.comic),
		save: saveDocument,
		onStatus: (s) => (saveStatus = s)
	});

	onMount(() => {
		loadDocument()
			.then((json) => {
				if (json) editor.load(deserialize(json));
			})
			.catch((e) => editor.say(`Couldn't open the saved comic: ${e.message}`))
			.finally(() => {
				autosave.markSaved();
				loaded = true;
			});
		const onHide = () => document.visibilityState === 'hidden' && autosave.saveNow();
		document.addEventListener('visibilitychange', onHide);
		return () => document.removeEventListener('visibilitychange', onHide);
	});

	$effect(() => {
		void editor.version;
		if (loaded) autosave.schedule();
	});

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
<svelte:window {onkeydown} {onpaste} />

<div class="flex h-screen flex-col bg-stone-100 text-stone-900">
	<Toolbar {editor} {saveStatus} />
	<div class="flex min-h-0 flex-1">
		<PageStrip {editor} />
		<main class="relative min-w-0 flex-1 overflow-auto" {@attach measure}>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				data-canvas
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
	@reference "./layout.css";
	.zoom {
		@apply grid h-6 min-w-6 place-items-center rounded-full hover:bg-stone-100;
	}
</style>
