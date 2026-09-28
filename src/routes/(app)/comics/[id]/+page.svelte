<script lang="ts">
	import { browser } from '$app/environment';
	import EditorApp from '$lib/components/EditorApp.svelte';
	import { useAssetBackend } from '$lib/persistence/assets.svelte';
	import { supabaseAssets } from '$lib/persistence/cloud-assets';
	import { CloudSource } from '$lib/persistence/cloud-source';
	import { supabaseBrowser } from '$lib/supabase/browser';

	let { data } = $props();

	const supabase = $derived(supabaseBrowser(data.supabase.url, data.supabase.key));
	// Keyed on the comic id below, so a new source is made per comic.
	const source = $derived(
		new CloudSource(supabase, data.comic.id, { doc: data.comic.doc, rev: data.comic.rev })
	);
	$effect.pre(() => {
		if (browser) useAssetBackend(supabaseAssets(supabase, data.user.id));
	});
</script>

{#key data.comic.id}
	<EditorApp {source} initialPage={data.page}>
		{#snippet nav()}
			<a href="/comics" class="mr-2 font-semibold tracking-tight text-stone-900" title="All comics">
				← Riverbanks
			</a>
		{/snippet}
	</EditorApp>
{/key}
