<!--
  Move/resize wrapper for anything with x, y, w, h in page units (free panels, balloons).
  The page is scaled with a CSS transform, so pointer deltas are divided by `scale`.
  Geometry changes apply live; oncommit gets the starting rect at pointer-up so the caller
  can record one undo step.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { HANDLES, moveRect, resizeRect, type Handle } from '$lib/geometry/rect';
	import type { Rect } from '$lib/model/types';

	let {
		target,
		scale,
		selected,
		id,
		label,
		z = 0,
		movable = true,
		following = false,
		claim,
		moving,
		mine,
		release,
		onselect,
		oncommit,
		ondblclick,
		children,
		extra
	}: {
		target: Rect;
		scale: number;
		selected: boolean;
		id: string;
		label: string;
		z?: number;
		movable?: boolean;
		/** Someone else is moving it: glide between their (10 Hz) position updates. */
		following?: boolean;
		/** Soft hold: claim when a drag really starts (false = someone else holds it). */
		claim?: (rect: Rect) => boolean;
		/** Soft hold: publish the live rect. */
		moving?: (rect: Rect) => void;
		/** Soft hold: is the claim still ours? (A simultaneous grab can go the other way.) */
		mine?: () => boolean;
		release?: () => void;
		onselect: (e: PointerEvent | FocusEvent) => void;
		oncommit: (before: Rect, action: 'move' | 'resize') => void;
		/**
		 * Handled here, not by the content: a press captures the pointer to this element, so the
		 * browser fires dblclick on it rather than on whatever is inside.
		 */
		ondblclick?: (e: MouseEvent) => void;
		children: Snippet;
		extra?: Snippet;
	} = $props();

	type Drag = { action: 'move' | Handle; start: Rect; x: number; y: number; moved: boolean };
	let drag: Drag | null = null;

	function begin(e: PointerEvent, action: Drag['action']) {
		e.stopPropagation();
		onselect(e);
		if (e.button !== 0 || (action === 'move' && !movable)) return;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		const { x, y, w, h } = target;
		drag = { action, start: { x, y, w, h }, x: e.clientX, y: e.clientY, moved: false };
	}

	function onpointermove(e: PointerEvent) {
		if (!drag) return;
		const delta = { dx: (e.clientX - drag.x) / scale, dy: (e.clientY - drag.y) / scale };
		if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
		if (!drag.moved && claim && !claim(drag.start)) return void (drag = null);
		drag.moved = true;
		if (mine && !mine()) return abort();
		const next =
			drag.action === 'move'
				? moveRect(drag.start, delta)
				: resizeRect(drag.start, drag.action, delta);
		Object.assign(target, next);
		moving?.(next);
	}

	/** Lost the object to someone who grabbed it first: put it back, record nothing. */
	function abort() {
		if (drag) Object.assign(target, drag.start);
		drag = null;
	}

	function onpointerup() {
		if (drag?.moved) {
			if (mine && !mine()) abort();
			else oncommit(drag.start, drag.action === 'move' ? 'move' : 'resize');
			release?.();
		}
		drag = null;
	}

	const handleSize = $derived(12 / scale);
</script>

<div
	class="transformer absolute"
	class:selected
	class:cursor-move={movable}
	class:following
	style:left="{target.x}px"
	style:top="{target.y}px"
	style:width="{target.w}px"
	style:height="{target.h}px"
	style:z-index={z}
	style:--handle="{handleSize}px"
	style:--ring="{2 / scale}px"
	data-element-id={id}
	role="button"
	tabindex="0"
	aria-label={label}
	aria-pressed={selected}
	onpointerdown={(e) => begin(e, 'move')}
	{onpointermove}
	{onpointerup}
	{ondblclick}
	onfocus={(e) => !selected && onselect(e)}
>
	{@render children()}
	{#if selected}
		{#each HANDLES as handle (handle)}
			<div
				class="handle {handle}"
				aria-hidden="true"
				onpointerdown={(e) => begin(e, handle)}
				{onpointermove}
				{onpointerup}
			></div>
		{/each}
		{@render extra?.()}
	{/if}
</div>

<style>
	.transformer {
		outline: none;
	}
	.transformer.following {
		transition:
			left 100ms linear,
			top 100ms linear,
			width 100ms linear,
			height 100ms linear;
	}
	.transformer.selected {
		box-shadow: 0 0 0 var(--ring) var(--color-sky-500);
	}
	.transformer:focus-visible {
		box-shadow: 0 0 0 var(--ring) var(--color-sky-600);
	}
	.handle {
		position: absolute;
		width: var(--handle);
		height: var(--handle);
		background: white;
		border: calc(var(--ring) * 0.75) solid var(--color-sky-500);
		border-radius: 2px;
		translate: -50% -50%;
		z-index: 10;
	}
	.nw {
		left: 0;
		top: 0;
		cursor: nwse-resize;
	}
	.n {
		left: 50%;
		top: 0;
		cursor: ns-resize;
	}
	.ne {
		left: 100%;
		top: 0;
		cursor: nesw-resize;
	}
	.e {
		left: 100%;
		top: 50%;
		cursor: ew-resize;
	}
	.se {
		left: 100%;
		top: 100%;
		cursor: nwse-resize;
	}
	.s {
		left: 50%;
		top: 100%;
		cursor: ns-resize;
	}
	.sw {
		left: 0;
		top: 100%;
		cursor: nesw-resize;
	}
	.w {
		left: 0;
		top: 50%;
		cursor: ew-resize;
	}
</style>
