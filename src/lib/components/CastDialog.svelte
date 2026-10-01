<!--
  One cast member of a style: kind, name, aliases, description and portraits. The starred
  portrait is the one sent with panels that name this member. Presentational: the style page
  owns saving. A native <dialog>, so Esc closes it and focus returns to the opener.
-->
<script lang="ts">
	import Star from '@lucide/svelte/icons/star';
	import X from '@lucide/svelte/icons/x';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { CAST_KINDS, type CastKind, type CastMember, type StyleRef } from '$lib/styles/styles';

	let {
		member,
		portraits,
		urls,
		readonly,
		generating,
		maxPortraits,
		onchange,
		onupload,
		onremoveportrait,
		onstar,
		ongenerate,
		ondelete,
		onclose
	}: {
		member: CastMember;
		portraits: StyleRef[];
		urls: Record<string, string>;
		readonly: boolean;
		generating: boolean;
		maxPortraits: number;
		onchange: (patch: Partial<CastMember>) => void;
		onupload: (files: File[]) => void;
		onremoveportrait: (ref: StyleRef) => void;
		onstar: (ref: StyleRef) => void;
		ongenerate: () => void;
		ondelete: () => void;
		onclose: () => void;
	} = $props();

	const KIND_LABEL: Record<CastKind, string> = {
		character: 'Character',
		object: 'Prop',
		place: 'Place'
	};

	let dialog = $state<HTMLDialogElement>();
	let confirmDelete = $state(false);
	$effect(() => {
		dialog?.showModal();
	});

	const starred = $derived(portraits.find((p) => p.id === member.portraitId) ?? portraits[0]);

	function onPortraitKey(e: KeyboardEvent, i: number) {
		const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (step) {
			e.preventDefault();
			const next = (i + step + portraits.length) % portraits.length;
			dialog?.querySelectorAll<HTMLElement>('[data-portrait]')[next]?.focus();
		} else if (!readonly && (e.key === ' ' || e.key === 'Enter')) {
			e.preventDefault();
			onstar(portraits[i]);
		} else if (!readonly && (e.key === 'Delete' || e.key === 'Backspace')) {
			e.preventDefault();
			onremoveportrait(portraits[i]);
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !readonly && !generating) {
			e.preventDefault();
			ongenerate();
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="w-[min(40rem,calc(100vw-2rem))] rounded-lg p-0 shadow-xl backdrop:bg-stone-900/40"
	aria-label="Cast member {member.name}"
	{onkeydown}
	{onclose}
>
	<div class="p-5">
		<div class="mb-4 flex items-center gap-2">
			<h2 class="flex-1 truncate text-lg font-semibold">{member.name || 'Unnamed'}</h2>
			{#if !readonly}
				{#if confirmDelete}
					<button class="text-sm font-medium text-red-700" onclick={ondelete}>Really delete?</button
					>
					<button class="text-sm text-stone-500" onclick={() => (confirmDelete = false)}
						>Cancel</button
					>
				{:else}
					<button
						class="text-sm text-stone-500 hover:text-red-700"
						onclick={() => (confirmDelete = true)}>Delete</button
					>
				{/if}
			{/if}
			<button
				class="grid h-7 w-7 place-items-center rounded text-stone-500 hover:bg-stone-100"
				aria-label="Close"
				onclick={() => dialog?.close()}><X size={16} /></button
			>
		</div>

		<fieldset class="mb-3 flex gap-4 text-sm" disabled={readonly}>
			<legend class="sr-only">Kind</legend>
			{#each CAST_KINDS as kind (kind)}
				<label class="flex items-center gap-1.5">
					<input
						type="radio"
						name="kind"
						value={kind}
						checked={member.kind === kind}
						onchange={() => onchange({ kind })}
					/>
					{KIND_LABEL[kind]}
				</label>
			{/each}
		</fieldset>

		<label class="label" for="cast-name">Name</label>
		<input
			id="cast-name"
			class="field"
			value={member.name}
			{readonly}
			placeholder="e.g. Ismahan at 42"
			onchange={(e) => onchange({ name: e.currentTarget.value.trim() })}
		/>

		<label class="label" for="cast-aliases">Also called</label>
		<input
			id="cast-aliases"
			class="field"
			value={member.aliases.join(', ')}
			{readonly}
			placeholder="Comma-separated, e.g. Ismahan, the princess"
			onchange={(e) =>
				onchange({
					aliases: e.currentTarget.value
						.split(',')
						.map((a) => a.trim())
						.filter(Boolean)
				})}
		/>
		<p class="hint">
			A panel gets this {KIND_LABEL[member.kind].toLowerCase()} when its prompt uses any of these names.
		</p>

		<label class="label" for="cast-description">Description</label>
		<textarea
			id="cast-description"
			class="field h-24"
			{readonly}
			placeholder="What stays the same in every panel: build, face, hair, clothes, colours."
			value={member.description}
			onchange={(e) => onchange({ description: e.currentTarget.value.trim() })}></textarea>

		<p class="label">Portraits</p>
		<div class="flex flex-wrap items-start gap-2" role="radiogroup" aria-label="Portraits">
			{#each portraits as p, i (p.id)}
				<div class="relative">
					<button
						data-portrait
						role="radio"
						aria-checked={p === starred}
						aria-label="Portrait {i + 1}{p === starred ? ', sent with panels' : ''}"
						tabindex={p === starred ? 0 : -1}
						class="block h-24 w-32 overflow-hidden rounded {p === starred
							? 'ring-2 ring-sky-500'
							: 'ring-1 ring-stone-200 hover:ring-stone-400'}"
						onclick={() => !readonly && onstar(p)}
						onkeydown={(e) => onPortraitKey(e, i)}
					>
						<img src={urls[p.id]} alt="" class="h-full w-full object-cover" />
					</button>
					{#if p === starred}
						<span class="absolute top-1 left-1 rounded bg-white/90 p-0.5 text-sky-600"
							><Star size={12} fill="currentColor" /></span
						>
					{/if}
					{#if !readonly}
						<button
							class="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-stone-600 shadow hover:text-red-700"
							aria-label="Remove portrait {i + 1}"
							tabindex="-1"
							onclick={() => onremoveportrait(p)}><X size={12} /></button
						>
					{/if}
				</div>
			{/each}
			{#if generating}
				<div class="grid h-24 w-32 place-items-center rounded bg-stone-100 text-xs text-stone-500">
					Drawing…
				</div>
			{/if}
			{#if !readonly && portraits.length < maxPortraits}
				<label
					class="grid h-24 w-32 cursor-pointer place-items-center rounded border-2 border-dashed border-stone-300 text-xs text-stone-500 focus-within:ring-2 focus-within:ring-sky-500 hover:bg-stone-50"
				>
					+ Upload
					<input
						type="file"
						accept="image/*"
						multiple
						class="sr-only"
						onchange={(e) => {
							onupload([...(e.currentTarget.files ?? [])]);
							e.currentTarget.value = '';
						}}
					/>
				</label>
			{/if}
		</div>
		{#if !readonly}
			<div class="mt-3 flex items-center gap-3">
				<button
					class="flex items-center gap-2 rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
					disabled={generating || portraits.length >= maxPortraits}
					aria-keyshortcuts="Meta+Enter"
					onclick={ongenerate}
				>
					<Sparkles size={15} />
					{generating ? 'Drawing…' : 'Generate sheet ⌘↵'}
				</button>
				<span class="text-xs text-stone-500">
					Drawn in this style from the description{portraits.length
						? ' and the starred portrait'
						: ''}. ★ marks the one sent with panels.
				</span>
			</div>
		{/if}
	</div>
</dialog>

<style lang="postcss">
	@reference "../../routes/layout.css";
	.label {
		@apply mt-3 mb-1 block text-xs font-semibold tracking-wide text-stone-500 uppercase;
	}
	.field {
		@apply w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm read-only:bg-stone-50;
	}
	.hint {
		@apply mt-1 text-xs text-stone-500;
	}
</style>
