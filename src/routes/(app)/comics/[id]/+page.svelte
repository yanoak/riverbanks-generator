<script lang="ts">
	import { browser } from '$app/environment';
	import EditorApp from '$lib/components/EditorApp.svelte';
	import { useAssetBackend } from '$lib/persistence/assets.svelte';
	import { supabaseAssets } from '$lib/persistence/cloud-assets';
	import { CloudDoc } from '$lib/persistence/cloud-doc';
	import { supabaseBrowser } from '$lib/supabase/browser';

	let { data } = $props();

	const supabase = $derived(supabaseBrowser(data.supabase.url, data.supabase.key));
	// Keyed on the comic id below, so a new document is made per comic.
	const cloud = $derived(new CloudDoc(supabase, data.comic.id));
	$effect.pre(() => {
		if (browser) useAssetBackend(supabaseAssets(supabase, data.user.id));
	});
</script>

{#key data.comic.id}
	<EditorApp {cloud} initialPage={data.page}>
		{#snippet nav()}
			<a href="/comics" class="mr-2 font-semibold tracking-tight text-stone-900" title="All comics">
				← Riverbanks
			</a>
		{/snippet}
	</EditorApp>
{/key}
