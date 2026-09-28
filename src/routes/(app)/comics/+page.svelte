<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	import PageView from '$lib/components/PageView.svelte';
	import type { Comic } from '$lib/model/types';
	import { useAssetBackend } from '$lib/persistence/assets.svelte';
	import { supabaseAssets } from '$lib/persistence/cloud-assets';
	import { findLocalComic, importLocalComic } from '$lib/persistence/import-local';
	import { supabaseBrowser } from '$lib/supabase/browser';

	let { data, form } = $props();
	const supabase = $derived(supabaseBrowser(data.supabase.url, data.supabase.key));

	let localComic = $state<Comic | null>(null);
	let importing = $state(false);
	let confirmDelete = $state<string | null>(null);
	let renaming = $state<string | null>(null);
	let createForm = $state<HTMLFormElement>();

	onMount(async () => {
		useAssetBackend(supabaseAssets(supabase, data.user.id));
		localComic = await findLocalComic();
	});

	async function importLocal() {
		if (!localComic) return;
		importing = true;
		try {
			const id = await importLocalComic(supabase, data.user.id, localComic);
			await goto(`/comics/${id}`);
		} finally {
			importing = false;
		}
	}

	const ago = (iso: string) => {
		const s = (Date.now() - new Date(iso).getTime()) / 1000;
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.round(s / 60)} min ago`;
		if (s < 86400) return `${Math.round(s / 3600)} h ago`;
		return new Date(iso).toLocaleDateString();
	};

	function onkeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA'].includes(t.tagName)) {
			e.preventDefault();
			createForm?.requestSubmit();
		}
	}
	const THUMB = 180;
</script>

<svelte:head><title>My comics — Riverbanks</title></svelte:head>
<svelte:window {onkeydown} />

<div class="min-h-screen bg-stone-100 text-stone-900">
	<header class="flex h-12 items-center border-b border-stone-200 bg-white px-4">
		<span class="font-semibold tracking-tight">Riverbanks</span>
		<div class="flex-1"></div>
		<AccountMenu email={data.user.email} />
	</header>

	<main class="mx-auto max-w-5xl px-4 py-8">
		<div class="mb-6 flex items-center">
			<h1 class="flex-1 text-2xl font-semibold">My comics</h1>
			<form method="POST" action="?/create" bind:this={createForm} use:enhance>
				<button
					class="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
					title="New comic (N)"
				>
					+ New comic
				</button>
			</form>
		</div>

		{#if form?.error}
			<p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{form.error}</p>
		{/if}

		{#if localComic}
			<div
				class="mb-6 flex items-center gap-3 rounded border border-sky-200 bg-sky-50 px-4 py-3 text-sm"
			>
				<span class="flex-1">
					You have a comic saved in this browser (“{localComic.title}”, {localComic.pages.length}
					page{localComic.pages.length === 1 ? '' : 's'}). Import it into your account?
				</span>
				<button
					class="rounded bg-sky-700 px-3 py-1.5 text-white disabled:opacity-50"
					disabled={importing}
					onclick={importLocal}
				>
					{importing ? 'Importing…' : 'Import'}
				</button>
			</div>
		{/if}

		{#if data.comics.length === 0}
			<p
				class="rounded border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-stone-500"
			>
				No comics yet — start with <strong>New comic</strong>{localComic
					? ', or import your local one above'
					: ''}.
			</p>
		{:else}
			<ul class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6">
				{#each data.comics as comic (comic.id)}
					<li class="group">
						<a
							href="/comics/{comic.id}"
							class="block rounded focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
							aria-label="Open {comic.title}"
						>
							<div
								class="pointer-events-none overflow-hidden bg-white shadow-sm ring-1 ring-stone-200 group-hover:ring-stone-400"
								style:width="{THUMB}px"
							>
								{#if comic.firstPage}
									<PageView page={comic.firstPage} scale={THUMB / comic.firstPage.width} />
								{/if}
							</div>
						</a>
						{#if renaming === comic.id}
							<form
								method="POST"
								action="?/rename"
								class="mt-2 flex gap-1"
								use:enhance={() =>
									async ({ update }) => {
										await update();
										renaming = null;
									}}
							>
								<input type="hidden" name="id" value={comic.id} />
								<!-- svelte-ignore a11y_autofocus -->
								<input
									name="title"
									value={comic.title}
									autofocus
									aria-label="Title"
									class="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
									onkeydown={(e) => e.key === 'Escape' && (renaming = null)}
								/>
								<button class="rounded border border-stone-300 px-2 text-sm">Save</button>
							</form>
						{:else}
							<p class="mt-2 truncate font-medium">{comic.title}</p>
						{/if}
						<p class="text-xs text-stone-500">
							{comic.pageCount} page{comic.pageCount === 1 ? '' : 's'} · edited {ago(
								comic.updatedAt
							)}
						</p>
						<div class="mt-1 flex gap-2 text-xs">
							<button
								class="text-stone-500 hover:text-stone-900"
								onclick={() => (renaming = comic.id)}>Rename</button
							>
							{#if confirmDelete === comic.id}
								<form method="POST" action="?/delete" use:enhance class="inline">
									<input type="hidden" name="id" value={comic.id} />
									<button class="font-medium text-red-700">Really delete?</button>
								</form>
								<button class="text-stone-500" onclick={() => (confirmDelete = null)}>Cancel</button
								>
							{:else}
								<button
									class="text-stone-500 hover:text-red-700"
									onclick={() => (confirmDelete = comic.id)}>Delete</button
								>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>
