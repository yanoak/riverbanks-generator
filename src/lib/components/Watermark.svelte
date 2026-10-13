<!--
  The export watermark, drawn in SVG so it stays vector in the PDF. Lay it over a page in a
  relative box. Edge: a small tracked line down the right margin, quiet but on every page.
  Diagonal: one big line across the page. Mid-grey with a lighter rim reads on dark posters and
  cream pages alike. Plans: 2026-10-12_export-watermark, 2026-10-13_download-modal.
-->
<script lang="ts">
	import { watermarkLayout, type WatermarkStyle } from '$lib/export/watermark';
	import { fontStack } from '$lib/typography/fonts';

	let {
		width,
		height,
		text,
		style = 'diagonal'
	}: { width: number; height: number; text: string; style?: WatermarkStyle } = $props();

	const layout = $derived(watermarkLayout(width, height, text, style));
	const edge = $derived(style === 'edge');
</script>

{#if layout}
	<svg
		class="pointer-events-none absolute inset-0 h-full w-full"
		viewBox="0 0 {width} {height}"
		aria-hidden="true"
		data-watermark={style}
	>
		<text
			x={layout.x}
			y={layout.y}
			transform="rotate({layout.angle} {layout.x} {layout.y})"
			text-anchor="middle"
			dominant-baseline="central"
			font-family={fontStack('Rubik')}
			font-weight={edge ? 600 : 800}
			font-size={layout.fontSize}
			letter-spacing="{layout.letterSpacing}em"
			fill={edge ? 'rgb(140 140 140 / 0.75)' : 'rgb(140 140 140 / 0.5)'}
			stroke={edge ? 'rgb(255 255 255 / 0.25)' : 'rgb(255 255 255 / 0.35)'}
			stroke-width={layout.fontSize / 30}>{text.trim()}</text
		>
	</svg>
{/if}
