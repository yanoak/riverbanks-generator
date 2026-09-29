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
	import type { Balloon, Panel, Rect } from '$lib/model/types';
	import type { Peer } from '$lib/collab/presence.svelte';
	import BalloonView from './BalloonView.svelte';
	import { richText } from '$lib/editor/rich-text';

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

	const balloons = $derived([...page.balloons].sort((a, b) => a.z - b.z));
	const selectedBalloonId = $derived(
		editor?.selection.kind === 'balloon' ? editor.selection.id : null
	);

	let tailDrag: { x: number; y: number; start: Balloon['tail'] } | null = null;

	function tailDown(e: PointerEvent, balloon: Balloon) {
		e.stopPropagation();
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		tailDrag = { x: e.clientX, y: e.clientY, start: { ...balloon.tail! } };
	}

	function tailMove(e: PointerEvent, balloon: Balloon) {
		if (!tailDrag?.start) return;
		balloon.tail = {
			x: tailDrag.start.x + (e.clientX - tailDrag.x) / scale,
			y: tailDrag.start.y + (e.clientY - tailDrag.y) / scale
		};
	}

	function tailUp(balloon: Balloon) {
		if (tailDrag) editor?.commit('Move tail', balloon, { tail: tailDrag.start });
		tailDrag = null;
	}

	// --- other people: where they are, what they have selected, what they are moving --------

	const peersHere = $derived(editor?.presence?.peers.filter((p) => p.page === page.id) ?? []);

	/** Someone else's live position for `id` while they move it. */
	function heldRect(id: string): Rect | undefined {
		return peersHere.find((p) => p.moving?.id === id)?.moving?.rect;
	}

	/** What to draw: the object, or where its mover has it right now. */
	function shown<T extends Rect & { id: string }>(item: T): T {
		const rect = heldRect(item.id);
		return rect ? { ...item, ...rect } : item;
	}

	type Outline = { id: string; points?: string; box: Rect; moving: boolean };
	function outlinesOf(peer: Peer): Outline[] {
		const ids = new Set([...peer.selection, ...(peer.moving ? [peer.moving.id] : [])]);
		return [...ids].flatMap((id): Outline[] => {
			const moving = peer.moving?.id === id;
			const shape = shapes.find((s) => s.panel.id === id);
			if (shape) return [{ id, points: shape.svgPoints, box: shape.bbox, moving }];
			const item = page.balloons.find((b) => b.id === id) ?? freePanels.find((p) => p.id === id);
			if (!item) return [];
			const r = (moving && peer.moving?.rect) || item;
			return [{ id, box: { x: r.x, y: r.y, w: r.w, h: r.h }, moving }];
		});
	}

	/** Soft-hold hooks for a Transformer on `id`. */
	const hold = (id: string) => ({
		claim: (r: Rect) => editor!.beginMove(id, r),
		moving: (r: Rect) => editor!.moveTo(r),
		mine: () => editor!.stillMoving(id),
		release: () => editor!.endMove()
	});

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
					target={shown(panel)}
					following={!!heldRect(panel.id)}
					{...hold(panel.id)}
					{scale}
					id={panel.id}
					label="Free panel {i + 1}"
					z={10 + i}
					selected={selectedIds.has(panel.id)}
					onselect={(e) => editor.selectPanel(panel.id, 'shiftKey' in e && e.shiftKey)}
					ondblclick={() => ondblclick(panel)}
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

		{#each balloons as original, i (original.id)}
			{@const balloon = shown(original)}
			{#if editor}
				<Transformer
					target={balloon}
					following={balloon !== original}
					{...hold(balloon.id)}
					{scale}
					id={balloon.id}
					label="{balloon.type} balloon {i + 1}"
					z={100 + i}
					selected={selectedBalloonId === balloon.id}
					movable={editor.editingBalloonId !== balloon.id}
					onselect={() => editor.select({ kind: 'balloon', id: balloon.id })}
					ondblclick={() => editor.startEditing(balloon.id)}
					oncommit={(before, action) =>
						editor.commitGeometry(
							original,
							before,
							action === 'move' ? 'Move balloon' : 'Resize balloon'
						)}
				>
					<div class="contents" role="presentation">
						{#if editor.editingBalloonId === balloon.id}
							<BalloonView {balloon}>
								{#snippet text()}
									<div
										class="rich-text cursor-text"
										{@attach richText(editor, original, editor.selectAllOnEdit)}
									></div>
								{/snippet}
							</BalloonView>
						{:else}
							<BalloonView {balloon} />
						{/if}
					</div>
					{#snippet extra()}
						{#if balloon.tail}
							<div
								class="tail-handle"
								style:left="{balloon.tail.x}px"
								style:top="{balloon.tail.y}px"
								style:--size="{14 / scale}px"
								role="presentation"
								title="Drag to point the tail"
								onpointerdown={(e) => tailDown(e, balloon)}
								onpointermove={(e) => tailMove(e, balloon)}
								onpointerup={() => tailUp(balloon)}
							></div>
						{/if}
					{/snippet}
				</Transformer>
			{:else}
				<div
					class="absolute"
					style:left="{balloon.x}px"
					style:top="{balloon.y}px"
					style:width="{balloon.w}px"
					style:height="{balloon.h}px"
				>
					<BalloonView {balloon} />
				</div>
			{/if}
		{/each}

		{#if peersHere.length}
			<svg
				class="pointer-events-none absolute inset-0 overflow-visible"
				style:z-index="10000"
				width={page.width}
				height={page.height}
				viewBox="0 0 {page.width} {page.height}"
				aria-hidden="true"
			>
				{#each peersHere as peer (peer.clientId)}
					{#each outlinesOf(peer) as o (o.id)}
						{#if o.points}
							<polygon
								points={o.points}
								fill="none"
								stroke={peer.user.color}
								stroke-width={3 / scale}
							/>
						{:else}
							<rect
								x={o.box.x}
								y={o.box.y}
								width={o.box.w}
								height={o.box.h}
								fill="none"
								stroke={peer.user.color}
								stroke-width={3 / scale}
								stroke-dasharray={o.moving ? `${8 / scale} ${5 / scale}` : undefined}
								class:glide={o.moving}
							/>
						{/if}
						<text
							data-peer-label
							x={o.box.x}
							y={o.box.y - 6 / scale}
							font-size={13 / scale}
							font-weight="600"
							fill={peer.user.color}
							stroke="white"
							stroke-width={3 / scale}
							paint-order="stroke"
							class:glide={o.moving}
							>{o.moving ? `${peer.user.name} is moving this` : peer.user.name}</text
						>
					{/each}
				{/each}
			</svg>
		{/if}

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
	>
		{#if panel.image}<PanelImage image={panel.image} />{/if}
	</div>
	{#if panel.border === 'solid'}
		<div class="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_4px_black]"></div>
	{/if}
{/snippet}

<style>
	:global(.collaboration-carets__caret) {
		position: relative;
		margin: 0 -1px;
		border-left: 2px solid;
		border-right: 0;
		pointer-events: none;
		word-break: normal;
	}
	:global(.collaboration-carets__label) {
		position: absolute;
		top: -1.4em;
		left: -2px;
		padding: 0 4px;
		border-radius: 3px 3px 3px 0;
		color: white;
		font:
			600 12px/1.4 system-ui,
			sans-serif;
		white-space: nowrap;
		user-select: none;
	}
	.glide {
		transition:
			x 100ms linear,
			y 100ms linear,
			width 100ms linear,
			height 100ms linear;
	}
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
	.rich-text :global(.ProseMirror) {
		outline: none;
		min-height: 1em;
	}
	.tail-handle {
		position: absolute;
		width: var(--size);
		height: var(--size);
		translate: -50% -50%;
		border-radius: 9999px;
		background: var(--color-amber-400);
		border: calc(var(--size) / 7) solid white;
		box-shadow: 0 0 0 1px var(--color-amber-700);
		cursor: crosshair;
		z-index: 20;
	}
	.hit:focus-visible {
		stroke: var(--color-sky-600);
		stroke-dasharray: 14 8;
	}
</style>
