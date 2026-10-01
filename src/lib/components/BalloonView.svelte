<!-- A balloon's outline and text, in balloon-local coordinates. Interaction lives outside. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { balloonShape, textInset } from '$lib/geometry/balloon';
	import type { Balloon } from '$lib/model/types';
	import { letteringFor, type Typography } from '$lib/typography/typography';

	let { balloon, typography, text }: { balloon: Balloon; typography: Typography; text?: Snippet } =
		$props();

	const shape = $derived(balloonShape(balloon.type, balloon.w, balloon.h, balloon.tail));
	const inset = $derived(textInset(balloon.type));
	const lettering = $derived(letteringFor(balloon, typography));
	const STROKE = 7;
</script>

<svg
	class="pointer-events-none absolute top-0 left-0 overflow-visible"
	width={balloon.w}
	height={balloon.h}
	aria-hidden="true"
>
	<g
		fill="none"
		stroke={balloon.stroke}
		stroke-width={STROKE}
		stroke-linejoin="round"
		stroke-dasharray={shape.dashed ? '12 9' : undefined}
	>
		{#each shape.paths as d, i (i)}<path {d} />{/each}
		{#each shape.circles as c, i (i)}<circle cx={c.cx} cy={c.cy} r={c.r} />{/each}
	</g>
	<g fill={balloon.fill}>
		{#each shape.paths as d, i (i)}<path {d} />{/each}
		{#each shape.circles as c, i (i)}<circle cx={c.cx} cy={c.cy} r={c.r} />{/each}
	</g>
</svg>

<div
	class="balloon-text absolute flex flex-col justify-center overflow-visible text-center"
	class:sfx={balloon.type === 'sfx'}
	style:inset="{balloon.h * inset}px {balloon.w * inset}px"
	style:font-family={lettering.fontFamily}
	style:font-weight={lettering.fontWeight}
	style:font-style={lettering.fontStyle}
	style:text-transform={lettering.textTransform}
	style:font-size="{balloon.fontSize}px"
	style:--sfx-fill={balloon.fill}
	style:--sfx-stroke={balloon.stroke}
>
	{#if text}
		{@render text()}
	{:else}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- the comic's own editor output -->
		{@html balloon.html}
	{/if}
</div>

<style>
	.balloon-text {
		line-height: 1.12;
		color: black;
		overflow-wrap: break-word;
	}
	.balloon-text :global(p) {
		margin: 0;
	}
	.balloon-text.sfx {
		color: var(--sfx-fill);
		-webkit-text-stroke: 0.09em var(--sfx-stroke);
		paint-order: stroke fill;
		letter-spacing: 0.03em;
		white-space: nowrap;
		transform: rotate(-6deg);
	}
</style>
