<!--
  The export watermark: one line of text along the page's rising diagonal, drawn in SVG so it
  stays vector in the PDF. Lay it over a page in a relative box. Mid-grey with a lighter rim
  reads on dark posters and cream pages alike. Plan: 2026-10-12_export-watermark.
-->
<script lang="ts">
	import { watermarkLayout } from '$lib/export/watermark';
	import { fontStack } from '$lib/typography/fonts';

	let { width, height, text }: { width: number; height: number; text: string } = $props();

	const layout = $derived(watermarkLayout(width, height, text));
</script>

{#if layout}
	<svg
		class="pointer-events-none absolute inset-0 h-full w-full"
		viewBox="0 0 {width} {height}"
		aria-hidden="true"
		data-watermark
	>
		<text
			x={layout.x}
			y={layout.y}
			transform="rotate({layout.angle} {layout.x} {layout.y})"
			text-anchor="middle"
			dominant-baseline="central"
			font-family={fontStack('Rubik')}
			font-weight="800"
			font-size={layout.fontSize}
			fill="rgb(140 140 140 / 0.5)"
			stroke="rgb(255 255 255 / 0.35)"
			stroke-width={layout.fontSize / 30}>{text.trim()}</text
		>
	</svg>
{/if}
