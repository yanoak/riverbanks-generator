<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
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
		if (browser) useAssetBackend(supabaseAssets(supabase, data.comic.id, data.user.id));
	});
</script>

{#key data.comic.id}
	<EditorApp
		{cloud}
		sharing={{ supabase, userId: data.user.id, email: data.user.email }}
		initialPage={data.page}
		onrevoked={() => goto('/comics?notice=no-access', { replaceState: true })}
	>
		{#snippet nav()}
			<a href="/comics" class="mr-2 font-semibold tracking-tight text-stone-900" title="All comics">
				← Riverbanks
			</a>
		{/snippet}
	</EditorApp>
{/key}
