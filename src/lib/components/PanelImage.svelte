<script lang="ts">
	import { assetUrl } from '$lib/persistence/assets.svelte';
	import type { PanelImage } from '$lib/model/types';

	let { image, ghost = false }: { image: PanelImage; ghost?: boolean } = $props();
	const src = $derived(assetUrl(image.assetId));
</script>

{#if src}
	<img
		{src}
		alt=""
		draggable="false"
		class="pointer-events-none absolute max-w-none select-none"
		class:opacity-35={ghost}
		style:left="{image.offsetX}px"
		style:top="{image.offsetY}px"
		style:width="{image.naturalWidth * image.scale}px"
		style:height="{image.naturalHeight * image.scale}px"
	/>
{/if}
