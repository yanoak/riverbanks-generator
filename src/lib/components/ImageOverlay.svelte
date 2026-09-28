<!--
  Image mode: drag to pan, wheel to zoom at the pointer, double-click or Esc to finish.
  The whole image is ghosted outside the panel so you can see what is being cropped.
  Pans and wheel bursts are applied live and recorded as one undo step each.
-->
<script lang="ts">
	import { panelBox } from '$lib/geometry/panel';
	import { zoomImage } from '$lib/geometry/image';
	import type { Editor } from '$lib/editor/editor.svelte';
	import { PatchCommand } from '$lib/model/commands/patch';
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
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		drag = { x: e.clientX, y: e.clientY, start: snapshot(image) };
	}

	function onpointermove(e: PointerEvent) {
		if (!drag) return;
		image.offsetX = drag.start.offsetX + (e.clientX - drag.x) / scale;
		image.offsetY = drag.start.offsetY + (e.clientY - drag.y) / scale;
	}

	function onpointerup() {
		if (drag) editor.record(PatchCommand.fromChange('Pan image', image, drag.start));
		drag = null;
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
				if (wheelStart) editor.record(PatchCommand.fromChange('Zoom image', image, wheelStart));
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
</div>
