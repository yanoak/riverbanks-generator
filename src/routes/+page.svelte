<script lang="ts">
	import Inspector from '$lib/components/Inspector.svelte';
	import PageStrip from '$lib/components/PageStrip.svelte';
	import PageView from '$lib/components/PageView.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import { Editor } from '$lib/editor/editor.svelte';
	import { handleShortcut } from '$lib/editor/shortcuts';

	const editor = new Editor();

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

	/** Track the canvas viewport size (bind:clientWidth did not update inside the flex layout). */
	function measure(node: HTMLElement) {
		const ro = new ResizeObserver(() => {
			viewportWidth = node.clientWidth;
			viewportHeight = node.clientHeight;
		});
		ro.observe(node);
		return () => ro.disconnect();
	}

	function onkeydown(e: KeyboardEvent) {
		if (handleShortcut(editor, e, fit)) e.preventDefault();
	}

	function onCanvasPointerDown(e: PointerEvent) {
		// Clicking the desk (outside the page's panels) clears the selection.
		if (e.target === e.currentTarget) editor.select({ kind: 'none' });
	}
</script>

<svelte:head><title>{editor.comic.title} — Riverbanks</title></svelte:head>
<svelte:window {onkeydown} />

<div class="flex h-screen flex-col bg-stone-100 text-stone-900">
	<Toolbar {editor} />
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
					<PageView page={editor.page} {scale} {editor} />
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
