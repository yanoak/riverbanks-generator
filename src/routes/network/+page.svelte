<!--
  /network — a public map of the story characters and their ties, from the canon the
  riverbook-network skill syncs out of the RIVERBOOK doc. A working reference, not exhibition material.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import NetworkGraph, { STORY_COLOURS } from '$lib/components/NetworkGraph.svelte';
	import { ageIn, filterNetwork, portraitFor, type Link } from '$lib/network/canon';

	let { data } = $props();
	const network = $derived(data.stored?.network ?? null);
	const stories = $derived([...(network?.stories ?? [])].sort((a, b) => a.order - b.order));

	let hidden = $state<Set<string>>(new Set());
	let institutions = $state(true);
	const MIN_YEAR = 2026;
	const MAX_YEAR = 2100;
	let yearValue = $state(MIN_YEAR); // the slider's left end means "all years"
	const year = $derived(yearValue <= MIN_YEAR ? null : yearValue);
	let selected = $state<string | null>(null);
	let graph = $state<NetworkGraph>();

	const view = $derived(
		network
			? filterNetwork(network, {
					stories: hidden.size
						? new Set(stories.map((s) => s.id).filter((id) => !hidden.has(id)))
						: null,
					institutions
				})
			: { people: [], links: [] }
	);
	const chosen = $derived(view.people.find((p) => p.id === selected) ?? null);
	const ties = $derived(
		chosen
			? view.links
					.filter((l) => l.source === chosen.id || l.target === chosen.id)
					.map((l) => ({
						l,
						other: view.people.find((p) => p.id === (l.source === chosen.id ? l.target : l.source))!
					}))
			: []
	);
	const storyTitle = (id: string | null) => stories.find((s) => s.id === id)?.title ?? '';
	const colour = (id: string) =>
		STORY_COLOURS[
			Math.max(
				0,
				stories.findIndex((s) => s.id === id)
			) % STORY_COLOURS.length
		];

	function toggle(id: string) {
		// Replaced, never mutated in place, so the plain Set stays reactive through `hidden`.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const next = new Set(hidden);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		hidden = next;
	}

	async function goTo(id: string) {
		selected = id;
		await tick();
		document.querySelector<SVGGElement>(`[data-node="${id}"]`)?.focus();
	}

	const TYPE_LABEL: Record<Link['type'], string> = {
		family: 'Family',
		inspired: 'Inspired',
		friends: 'Friends',
		work: 'Work',
		member: 'Member of',
		companion: 'Companion'
	};
	const synced = $derived(
		data.stored
			? new Date(data.stored.syncedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
			: ''
	);
</script>

<svelte:head><title>Story network — Riverbanks</title></svelte:head>

<div class="flex h-screen flex-col bg-stone-100 text-stone-900">
	{#if data.user}
		<AppHeader email={data.user.email ?? ''} />
	{:else}
		<header class="flex h-12 items-center gap-4 border-b border-stone-200 bg-white px-4">
			<span class="font-semibold tracking-tight">Riverbanks</span>
			<div class="flex-1"></div>
			<a href="/login?redirectTo=/network" class="text-sm text-stone-500 hover:text-stone-900"
				>Sign in</a
			>
		</header>
	{/if}

	{#if !network}
		<main class="mx-auto max-w-xl px-4 py-16 text-center">
			<h1 class="mb-2 text-xl font-semibold">No story network yet</h1>
			<p class="text-sm text-stone-600">
				The network is built from the RIVERBOOK doc. Run the <code>riverbook-network</code> skill in Claude
				Code to sync it.
			</p>
		</main>
	{:else}
		<div
			class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 bg-white px-4 py-2 text-sm"
		>
			<h1 class="font-semibold">Story network</h1>
			<span class="text-xs text-stone-500">
				Synced {synced} from
				{#each network.meta.sources as s, i (s.url)}{i ? ' + ' : ''}<a
						class="underline hover:text-stone-800"
						href={s.url}
						target="_blank"
						rel="noreferrer">{s.name}</a
					>{/each}
			</span>
			<div class="flex flex-wrap gap-1" role="group" aria-label="Stories">
				{#each stories as s (s.id)}
					<button
						class="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs {hidden.has(
							s.id
						)
							? 'border-stone-200 text-stone-400'
							: 'border-stone-300 bg-stone-50'}"
						aria-pressed={!hidden.has(s.id)}
						onclick={() => toggle(s.id)}
					>
						<span
							class="h-2.5 w-2.5 rounded-full"
							style:background={hidden.has(s.id) ? '#d6d3d1' : colour(s.id)}
						></span>
						{s.title}{s.years ? ` · ${s.years}` : ''}
					</button>
				{/each}
			</div>
			<label class="flex items-center gap-1.5 text-xs">
				<input type="checkbox" bind:checked={institutions} /> Institutions
			</label>
			<label class="flex items-center gap-2 text-xs">
				Year
				<input
					type="range"
					min={MIN_YEAR}
					max={MAX_YEAR}
					bind:value={yearValue}
					aria-valuetext={year === null ? 'All years' : String(year)}
				/>
				<span class="w-16 tabular-nums">{year ?? 'All years'}</span>
			</label>
		</div>

		<div class="flex min-h-0 flex-1 flex-col md:flex-row">
			<div class="relative min-h-[420px] flex-1">
				<NetworkGraph
					bind:this={graph}
					people={view.people}
					links={view.links}
					{stories}
					{year}
					bind:selected
				/>
				<div
					class="pointer-events-none absolute bottom-2 left-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500"
				>
					<span>── family</span><span class="text-amber-700">╌╌ inspired</span><span>─ ─ work</span
					><span>··· member of</span><span>● person</span><span>○ animal / companion</span><span
						>◇ institution</span
					>
				</div>
				<div class="absolute top-2 right-2 flex gap-1">
					<button class="tool" aria-label="Zoom in" onclick={() => graph?.zoomBy(1.25)}>+</button>
					<button class="tool" aria-label="Zoom out" onclick={() => graph?.zoomBy(0.8)}>−</button>
					<button class="tool" onclick={() => graph?.fit()}>Fit</button>
				</div>
			</div>

			<aside
				class="w-full shrink-0 overflow-y-auto border-t border-stone-200 bg-white p-4 md:w-80 md:border-t-0 md:border-l"
				aria-label="Details"
			>
				{#if chosen}
					<h2 class="text-lg font-semibold">{chosen.name}</h2>
					<p class="mb-2 text-xs text-stone-500">
						{chosen.kind}{chosen.born ? ` · born ${chosen.born}` : ''}{chosen.died
							? ` · died ${chosen.died}`
							: ''}{year !== null && ageIn(chosen, year) !== null
							? ` · ${ageIn(chosen, year)} in ${year}`
							: ''}{chosen.home ? ` · ${chosen.home}` : ''}
					</p>
					{#if chosen.aliases.length}<p class="mb-2 text-xs text-stone-500">
							Also: {chosen.aliases.join(', ')}
						</p>{/if}
					<div class="mb-3 flex flex-wrap gap-1">
						{#each chosen.stories as s (s)}
							<span
								class="rounded-full px-2 py-0.5 text-[11px] text-white"
								style:background={colour(s)}>{storyTitle(s)}</span
							>
						{/each}
					</div>
					{@const look = portraitFor(chosen, year)}
					{#if look?.url}
						<img
							src={look.url}
							alt="{look.cast}, character sheet"
							class="mb-2 w-full rounded border border-stone-200 bg-stone-50"
						/>
						{#if chosen.portraits.length > 1}
							<p class="mb-3 flex flex-wrap gap-1 text-[11px] text-stone-500">
								Looks:
								{#each chosen.portraits as pt (pt.cast)}
									<span
										class="rounded-full border px-1.5 {pt === look
											? 'border-stone-500 text-stone-800'
											: 'border-stone-200'}">{pt.cast}{pt.from ? ` · ${pt.from}` : ''}</span
									>
								{/each}
							</p>
						{/if}
					{/if}
					<p class="mb-4 text-sm leading-relaxed text-stone-700">{chosen.summary}</p>
					<h3 class="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">Ties</h3>
					<ul class="space-y-1">
						{#each ties as { l, other } (l.id)}
							<li>
								<button
									class="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-stone-100"
									onclick={() => goTo(other.id)}
								>
									<span class="font-medium">{other.name}</span>
									<span class="text-stone-500">
										· {l.label || TYPE_LABEL[l.type]}{l.year ? `, ${l.year}` : ''}</span
									>
									{#if l.note}<span class="mt-0.5 block text-xs text-stone-500">{l.note}</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-stone-500">
						Select someone to see who they are and how they connect. Drag to rearrange, scroll to
						zoom. Move the year to see who is alive and how old.
					</p>
					<p class="mt-3 text-xs text-stone-500">
						{view.people.length} shown · {view.links.length} ties
					</p>
					{#if network.meta.notes.length}
						<ul class="mt-3 list-disc space-y-1 pl-4 text-xs text-stone-500">
							{#each network.meta.notes as n (n)}<li>{n}</li>{/each}
						</ul>
					{/if}
				{/if}
			</aside>
		</div>
	{/if}
</div>

<style lang="postcss">
	@reference "../layout.css";
	.tool {
		@apply grid h-7 min-w-7 place-items-center rounded border border-stone-300 bg-white px-2 text-sm shadow-sm hover:bg-stone-50;
	}
</style>
