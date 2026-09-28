<!--
  Renders one page at a given scale. With an editor it is interactive: panels are focusable
  hit targets and the selection is outlined; without one it is a static render (thumbnails,
  export).
-->
<script lang="ts">
	import { clipPathFor, panelOutline, polygonBBox } from '$lib/geometry/grid';
	import type { Editor } from '$lib/editor/editor.svelte';
	import type { FreePanel, GridPanel, Page } from '$lib/model/types';
	import Transformer from './Transformer.svelte';
	import PanelImage from './PanelImage.svelte';
	import ImageOverlay from './ImageOverlay.svelte';
	import type { Panel } from '$lib/model/types';

	let { page, scale, editor }: { page: Page; scale: number; editor?: Editor } = $props();

	const shapes = $derived(
		page.panels
			.filter((p): p is GridPanel => p.kind === 'grid')
			.map((panel) => {
				const points = panelOutline(panel.cells, page.grid, page);
				return {
					panel,
					points,
					bbox: polygonBBox(points),
					clip: clipPathFor(points),
					svgPoints: points.map((p) => `${p.x},${p.y}`).join(' ')
				};
			})
			// Reading order, so Tab walks the page left-to-right, top-to-bottom.
			.sort((a, b) => Math.min(...a.panel.cells) - Math.min(...b.panel.cells))
	);

	const freePanels = $derived(
		page.panels.filter((p): p is FreePanel => p.kind === 'free').sort((a, b) => a.z - b.z)
	);

	const selectedIds = $derived(
		editor?.selection.kind === 'panels' ? new Set(editor.selection.ids) : new Set<string>()
	);

	let pointerSelecting = false;

	function onpointerdown(e: PointerEvent, id: string) {
		pointerSelecting = true;
		editor?.selectPanel(id, e.shiftKey || e.metaKey);
		requestAnimationFrame(() => (pointerSelecting = false));
	}

	function ondragover(e: DragEvent) {
		if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
	}

	function ondrop(e: DragEvent, id: string) {
		const file = e.dataTransfer?.files[0];
		if (!file || !editor) return;
		e.preventDefault();
		editor.setImage(id, file);
	}

	function ondblclick(panel: Panel) {
		if (!editor) return;
		editor.selectPanel(panel.id);
		editor.enterImageMode();
	}

	function onfocus(id: string) {
		if (!editor || pointerSelecting || selectedIds.has(id)) return;
		editor.selectPanel(id);
	}
</script>

<div class="relative" style:width="{page.width * scale}px" style:height="{page.height * scale}px">
	<div
		class="page absolute top-0 left-0 bg-white"
		style:width="{page.width}px"
		style:height="{page.height}px"
		style:transform="scale({scale})"
		style:transform-origin="top left"
	>
		{#each shapes as { panel, bbox, clip } (panel.id)}
			<div
				class="absolute overflow-hidden"
				style:left="{bbox.x}px"
				style:top="{bbox.y}px"
				style:width="{bbox.w}px"
				style:height="{bbox.h}px"
				style:clip-path={clip}
				style:background={panel.fill}
			>
				{#if panel.image}<PanelImage image={panel.image} />{/if}
			</div>
		{/each}

		<svg
			class="pointer-events-none absolute inset-0"
			width={page.width}
			height={page.height}
			viewBox="0 0 {page.width} {page.height}"
			aria-hidden="true"
		>
			{#each shapes as { panel, svgPoints } (panel.id)}
				{#if panel.border === 'solid'}
					<polygon
						points={svgPoints}
						fill="none"
						stroke="black"
						stroke-width="4"
						stroke-linejoin="miter"
					/>
				{/if}
			{/each}
		</svg>

		{#if editor}
			<svg
				class="absolute inset-0"
				width={page.width}
				height={page.height}
				viewBox="0 0 {page.width} {page.height}"
			>
				{#each shapes as { panel, svgPoints }, i (panel.id)}
					<polygon
						data-panel-id={panel.id}
						points={svgPoints}
						role="button"
						tabindex="0"
						aria-label="Panel {i + 1}{panel.cells.length > 1
							? ` (${panel.cells.length} cells)`
							: ''}"
						aria-pressed={selectedIds.has(panel.id)}
						class="hit cursor-pointer outline-none"
						class:selected={selectedIds.has(panel.id)}
						onpointerdown={(e) => onpointerdown(e, panel.id)}
						onfocus={() => onfocus(panel.id)}
						{ondragover}
						ondrop={(e) => ondrop(e, panel.id)}
						ondblclick={() => ondblclick(panel)}
					/>
				{/each}
			</svg>
		{/if}

		{#each freePanels as panel, i (panel.id)}
			{#if editor}
				<Transformer
					target={panel}
					{scale}
					id={panel.id}
					label="Free panel {i + 1}"
					z={10 + i}
					selected={selectedIds.has(panel.id)}
					onselect={(e) => editor.selectPanel(panel.id, 'shiftKey' in e && e.shiftKey)}
					oncommit={(before, action) =>
						editor.commitGeometry(panel, before, action === 'move' ? 'Move panel' : 'Resize panel')}
				>
					{@render freePanelBody(panel)}
				</Transformer>
			{:else}
				<div
					class="absolute"
					style:left="{panel.x}px"
					style:top="{panel.y}px"
					style:width="{panel.w}px"
					style:height="{panel.h}px"
				>
					{@render freePanelBody(panel)}
				</div>
			{/if}
		{/each}

		{#if editor?.mode === 'image' && editor.imagePanel?.image}
			<ImageOverlay {editor} {page} panel={editor.imagePanel} {scale} />
		{/if}
	</div>
</div>

{#snippet freePanelBody(panel: FreePanel)}
	<div
		class="absolute inset-0 overflow-hidden"
		style:background={panel.fill}
		role="presentation"
		{ondragover}
		ondrop={(e) => ondrop(e, panel.id)}
		ondblclick={() => ondblclick(panel)}
	>
		{#if panel.image}<PanelImage image={panel.image} />{/if}
	</div>
	{#if panel.border === 'solid'}
		<div class="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_4px_black]"></div>
	{/if}
{/snippet}

<style>
	.hit {
		fill: transparent;
		stroke: transparent;
		stroke-width: 10;
		transition:
			fill 80ms,
			stroke 80ms;
	}
	.hit:hover {
		fill: color-mix(in oklab, var(--color-sky-500) 8%, transparent);
	}
	.hit.selected {
		fill: color-mix(in oklab, var(--color-sky-500) 14%, transparent);
		stroke: var(--color-sky-500);
	}
	.hit:focus-visible {
		stroke: var(--color-sky-600);
		stroke-dasharray: 14 8;
	}
</style>
