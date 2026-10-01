<script lang="ts">
	import EditorApp from '$lib/components/EditorApp.svelte';
	import { browser } from '$app/environment';
	import { indexedDbAssets, useAssetBackend } from '$lib/persistence/assets.svelte';
	import { localSource } from '$lib/persistence/local-source';

	if (browser) useAssetBackend(indexedDbAssets);
</script>

<EditorApp source={localSource}>
	{#snippet nav()}
		<a href="/" class="mr-2 font-display tracking-wide text-stone-900">Riverbanks</a>
		<span
			class="mr-2 rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-500"
			title="Saved in this browser only"
		>
			Local
		</span>
	{/snippet}
</EditorApp>
