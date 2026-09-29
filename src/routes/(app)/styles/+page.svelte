<script lang="ts">
	import { enhance } from '$app/forms';
	import AppHeader from '$lib/components/AppHeader.svelte';

	let { data } = $props();
	let createForm = $state<HTMLFormElement>();

	function onkeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA'].includes(t.tagName)) {
			e.preventDefault();
			createForm?.requestSubmit();
		}
	}
</script>

<svelte:head><title>Styles — Riverbanks</title></svelte:head>
<svelte:window {onkeydown} />

<div class="min-h-screen bg-stone-100 text-stone-900">
	<AppHeader email={data.user.email} />

	<main class="mx-auto max-w-5xl px-4 py-8">
		<div class="mb-6 flex items-center">
			<h1 class="flex-1 text-2xl font-semibold">Styles</h1>
			<form method="POST" action="?/create" bind:this={createForm} use:enhance>
				<button
					class="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
					title="New style (N)"
				>
					+ New style
				</button>
			</form>
		</div>

		{#if data.profiles.length === 0}
			<p
				class="rounded border border-dashed border-stone-300 bg-white px-6 py-12 text-center text-stone-500"
			>
				No styles yet. A style is reference images plus a description that every generated image in
				a comic follows. Start with <strong>New style</strong>.
			</p>
		{:else}
			<ul class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6">
				{#each data.profiles as p (p.id)}
					<li>
						<a
							href="/styles/{p.id}"
							class="block rounded bg-white p-3 shadow-sm ring-1 ring-stone-200 hover:ring-stone-400 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
						>
							<div class="mb-3 flex h-28 gap-1 overflow-hidden rounded bg-stone-100">
								{#each p.refs.slice(0, 4) as ref (ref.id)}
									<img src={data.thumbs[ref.id]} alt="" class="h-28 min-w-0 flex-1 object-cover" />
								{:else}
									<span class="grid flex-1 place-items-center text-xs text-stone-400"
										>No references</span
									>
								{/each}
							</div>
							<p class="truncate font-medium">{p.name}</p>
							<div class="mt-1 flex h-3 gap-0.5" aria-hidden="true">
								{#each p.palette.slice(0, 8) as c (c.hex)}
									<span class="w-4 rounded-sm" style:background={c.hex}></span>
								{/each}
							</div>
							<p class="mt-1 truncate text-xs text-stone-500">
								{p.createdBy === data.user.id ? 'by you' : `by ${p.creatorEmail ?? 'someone'}`}
								· {p.refs.length} reference{p.refs.length === 1 ? '' : 's'}
							</p>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
</div>
