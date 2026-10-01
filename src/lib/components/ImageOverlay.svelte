<!--
  Image mode: drag to pan, wheel to zoom at the pointer, drag a corner handle to resize (aspect
  locked, the opposite corner fixed), double-click or Esc to finish.
  The whole image is ghosted outside the panel so you can see what is being cropped.
  Pans and wheel bursts are applied live and recorded as one undo step each.
-->
<script lang="ts">
	import { panelBox } from '$lib/geometry/panel';
	import { resizeFromCorner, zoomImage } from '$lib/geometry/image';
	import type { Editor } from '$lib/editor/editor.svelte';
	import type { Page, Panel, PanelImage as Img } from '$lib/model/types';
	import PanelImage from './PanelImage.svelte';

	let { editor, page, panel, scale }: { editor: Editor; page: Page; panel: Panel; scale: number } =
		$props();

	const box = $derived(panelBox(page, panel));
	const image = $derived(panel.image!);

	type Placement = Pick<Img, 'offsetX' | 'offsetY' | 'scale'>;
	const snapshot = (i: Img): Placement => ({
		offsetX: i.offsetX,
		offsetY: i.offsetY,
		scale: i.scale
	});

	let drag: { x: number; y: number; start: Placement } | null = null;

	function onpointerdown(e: PointerEvent) {
		e.stopPropagation();
		// Soft hold: nobody else may pan this image (or move this panel) meanwhile.
		if (!editor.beginMove(panel.id, box)) return;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		drag = { x: e.clientX, y: e.clientY, start: snapshot(image) };
	}

	function onpointermove(e: PointerEvent) {
		if (!drag) return;
		image.offsetX = drag.start.offsetX + (e.clientX - drag.x) / scale;
		image.offsetY = drag.start.offsetY + (e.clientY - drag.y) / scale;
	}

	function onpointerup() {
		if (drag && editor.stillMoving(panel.id))
			editor.commit('Pan image', panel, { image: drag.start });
		else if (drag) Object.assign(image, drag.start);
		if (drag) editor.endMove();
		drag = null;
	}

	// --- corner handles: resize with the aspect ratio locked ----------------------------------

	type Corner = 'tl' | 'tr' | 'bl' | 'br';
	const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];
	let overlay = $state<HTMLElement>();
	let resize: { corner: Corner; start: Placement } | null = null;

	/** A corner of the image, in page units. */
	function cornerAt(corner: Corner) {
		const w = image.naturalWidth * image.scale;
		const h = image.naturalHeight * image.scale;
		return {
			x: box.x + image.offsetX + (corner[1] === 'r' ? w : 0),
			y: box.y + image.offsetY + (corner[0] === 'b' ? h : 0)
		};
	}

	/** The pointer in panel-box coordinates. */
	function inBox(e: PointerEvent) {
		const rect = overlay!.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) / scale - box.x,
			y: (e.clientY - rect.top) / scale - box.y
		};
	}

	function handleDown(e: PointerEvent, corner: Corner) {
		e.stopPropagation();
		if (!editor.beginMove(panel.id, box)) return;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		resize = { corner, start: snapshot(image) };
	}

	function handleMove(e: PointerEvent) {
		if (!resize) return;
		Object.assign(image, resizeFromCorner(resize.start, image, resize.corner, inBox(e)));
	}

	function handleUp() {
		if (resize && editor.stillMoving(panel.id))
			editor.commit('Resize image', panel, { image: resize.start });
		else if (resize) Object.assign(image, resize.start);
		if (resize) editor.endMove();
		resize = null;
	}

	let wheelStart: Placement | null = null;
	let wheelTimer: ReturnType<typeof setTimeout>;

	function wheel(node: HTMLElement) {
		const handler = (e: WheelEvent) => {
			e.preventDefault();
			const rect = node.getBoundingClientRect();
			const anchor = {
				x: (e.clientX - rect.left) / scale - box.x,
				y: (e.clientY - rect.top) / scale - box.y
			};
			wheelStart ??= snapshot(image);
			Object.assign(image, zoomImage(snapshot(image), Math.exp(-e.deltaY * 0.002), anchor));
			clearTimeout(wheelTimer);
			wheelTimer = setTimeout(() => {
				if (wheelStart) editor.commit('Zoom image', panel, { image: wheelStart });
				wheelStart = null;
			}, 250);
		};
		node.addEventListener('wheel', handler, { passive: false });
		return () => node.removeEventListener('wheel', handler);
	}
</script>

<div class="pointer-events-none absolute" style:left="{box.x}px" style:top="{box.y}px">
	<PanelImage {image} ghost />
</div>
<div
	bind:this={overlay}
	class="absolute inset-0 cursor-grab bg-black/5 active:cursor-grabbing"
	style:z-index="500"
	role="application"
	aria-label="Image mode: drag to pan, scroll to zoom, arrows pan, + and − zoom, 0 fills, Esc finishes"
	{@attach wheel}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	ondblclick={() => editor.exitImageMode()}
>
	<div
		class="pointer-events-none absolute"
		style:left="{box.x}px"
		style:top="{box.y}px"
		style:width="{box.w}px"
		style:height="{box.h}px"
		style:box-shadow="0 0 0 {2 / scale}px var(--color-amber-500)"
	></div>
	{#each CORNERS as corner (corner)}
		{@const at = cornerAt(corner)}
		<div
			class="img-handle {corner}"
			data-image-handle={corner}
			style:left="{at.x}px"
			style:top="{at.y}px"
			style:--size="{12 / scale}px"
			role="presentation"
			title="Drag to resize (keeps proportions)"
			onpointerdown={(e) => handleDown(e, corner)}
			onpointermove={handleMove}
			onpointerup={handleUp}
		></div>
	{/each}
</div>

<style>
	.img-handle {
		position: absolute;
		width: var(--size);
		height: var(--size);
		translate: -50% -50%;
		background: white;
		border: calc(var(--size) / 6) solid var(--color-amber-500);
	}
	.img-handle.tl,
	.img-handle.br {
		cursor: nwse-resize;
	}
	.img-handle.tr,
	.img-handle.bl {
		cursor: nesw-resize;
	}
</style>
