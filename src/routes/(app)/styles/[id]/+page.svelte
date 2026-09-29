<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy, tick } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { downscale } from '$lib/styles/downscale';
	import {
		MAX_REFS,
		REF_ROLES,
		addRef,
		deleteProfile,
		removeRef,
		saveProfile,
		updateRef,
		type PaletteColor,
		type ProfilePatch,
		type StyleRef
	} from '$lib/styles/styles';
	import { supabaseBrowser } from '$lib/supabase/browser';

	let { data } = $props();
	const supabase = $derived(supabaseBrowser(data.supabase.url, data.supabase.key));
	const readonly = $derived(!data.canEdit);

	// Local copies: edited here, saved in the background.
	// svelte-ignore state_referenced_locally
	const initial = data.profile;
	let name = $state(initial.name);
	let style = $state(initial.style);
	let palette = $state<PaletteColor[]>(initial.palette);
	let avoid = $state(initial.avoid);
	let refs = $state<StyleRef[]>(initial.refs);
	// svelte-ignore state_referenced_locally
	let urls = $state<Record<string, string>>({ ...data.thumbs });

	let status = $state<'saved' | 'saving' | 'error'>('saved');
	let message = $state('');
	let describing = $state(false);
	let describeError = $state('');
	let uploading = $state(0);
	let confirmDelete = $state(false);
	let dragOver = $state(false);
	let uploadButton = $state<HTMLElement>();

	// --- saving the text fields ---------------------------------------------------------
	let pending: ProfilePatch = {};
	let timer: ReturnType<typeof setTimeout> | undefined;

	function queue(patch: ProfilePatch) {
		if (readonly) return;
		pending = { ...pending, ...patch };
		status = 'saving';
		clearTimeout(timer);
		timer = setTimeout(flush, 600);
	}

	async function flush() {
		clearTimeout(timer);
		const patch = pending;
		pending = {};
		if (!Object.keys(patch).length) return;
		try {
			await saveProfile(supabase, data.profile.id, patch);
			if (!Object.keys(pending).length) status = 'saved';
		} catch (e) {
			status = 'error';
			message = (e as Error).message;
		}
	}
	onDestroy(flush);

	const setPalette = (next: PaletteColor[]) => {
		palette = next;
		queue({ palette: next });
	};

	// --- references ---------------------------------------------------------------------
	async function upload(files: Iterable<File>) {
		if (readonly) return;
		const images = [...files].filter((f) => f.type.startsWith('image/'));
		const room = MAX_REFS - refs.length - uploading;
		if (images.length > room) message = `A style holds up to ${MAX_REFS} references.`;
		for (const file of images.slice(0, Math.max(0, room))) {
			uploading++;
			try {
				const small = await downscale(file);
				const ref = await addRef(supabase, data.profile.id, small.blob, small);
				urls[ref.id] = URL.createObjectURL(small.blob);
				refs.push(ref);
			} catch (e) {
				status = 'error';
				message = (e as Error).message;
			} finally {
				uploading--;
			}
		}
	}

	async function changeRef(ref: StyleRef, patch: Partial<Pick<StyleRef, 'role' | 'label'>>) {
		Object.assign(ref, patch);
		try {
			await updateRef(supabase, ref.id, patch);
		} catch (e) {
			status = 'error';
			message = (e as Error).message;
		}
	}

	async function remove(ref: StyleRef, index: number) {
		refs.splice(index, 1);
		await tick();
		// Focus the next reference's remove button, else Upload.
		const next = document.querySelectorAll<HTMLElement>('[data-ref-remove]')[index];
		(next ?? uploadButton)?.focus();
		try {
			await removeRef(supabase, ref);
		} catch (e) {
			status = 'error';
			message = (e as Error).message;
		}
	}

	function onpaste(e: ClipboardEvent) {
		const t = e.target as HTMLElement;
		if (['INPUT', 'TEXTAREA'].includes(t.tagName)) return;
		const files = [...(e.clipboardData?.files ?? [])];
		if (files.length) {
			e.preventDefault();
			upload(files);
		}
	}

	// --- describe -----------------------------------------------------------------------
	async function describe() {
		describing = true;
		describeError = '';
		try {
			const res = await fetch(`/api/styles/${data.profile.id}/describe`, { method: 'POST' });
			const body = await res.json();
			if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
			style = body.style;
			palette = body.palette;
			avoid = body.avoid;
			queue({ style, palette, avoid });
		} catch (e) {
			describeError = (e as Error).message;
		} finally {
			describing = false;
		}
	}

	async function destroy() {
		clearTimeout(timer);
		pending = {};
		if (await deleteProfile(supabase, data.profile.id)) await goto('/styles');
	}
</script>

<svelte:head><title>{name} — Styles — Riverbanks</title></svelte:head>
<svelte:window {onpaste} />

<div class="min-h-screen bg-stone-100 text-stone-900">
	<AppHeader email={data.user.email} />

	<main class="mx-auto max-w-4xl px-4 py-6">
		<div class="mb-6 flex items-center gap-3">
			<a href="/styles" class="text-sm text-stone-500 hover:text-stone-900">← Styles</a>
			<input
				class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold hover:border-stone-300 focus:border-stone-400 focus:bg-white focus:outline-none"
				aria-label="Style name"
				bind:value={name}
				{readonly}
				oninput={() => name.trim() && queue({ name: name.trim() })}
			/>
			<span class="text-xs text-stone-500" role="status">
				{#if readonly}
					Made by {data.profile.creatorEmail ?? 'someone else'} · read-only
				{:else if status === 'saving'}
					Saving…
				{:else if status === 'saved'}
					Saved ✓
				{/if}
			</span>
			{#if !readonly}
				{#if confirmDelete}
					<button class="text-sm font-medium text-red-700" onclick={destroy}>Really delete?</button>
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
		</div>

		{#if status === 'error' || message}
			<p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
				{message}
				<button class="ml-2 underline" onclick={() => ((message = ''), (status = 'saved'))}
					>Dismiss</button
				>
			</p>
		{/if}

		<section class="mb-8">
			<h2 class="section">References</h2>
			<p class="mb-3 text-xs text-stone-500">
				Up to {MAX_REFS} images. <em>Style</em> images set the look; label <em>character</em> and
				<em>object</em> images with a name you can use in prompts, like “Mae”.
			</p>
			<ul class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
				{#each refs as ref, i (ref.id)}
					<li class="rounded bg-white p-2 shadow-sm ring-1 ring-stone-200">
						<div class="relative">
							<img
								src={urls[ref.id]}
								alt={ref.label || `Reference ${i + 1}`}
								class="h-28 w-full rounded object-cover"
							/>
							{#if !readonly}
								<button
									class="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-stone-600 shadow hover:text-red-700"
									aria-label="Remove reference {i + 1}"
									data-ref-remove
									onclick={() => remove(ref, i)}><X size={14} /></button
								>
							{/if}
						</div>
						<select
							class="mt-2 w-full rounded border border-stone-300 px-1 py-0.5 text-xs"
							aria-label="Reference {i + 1} role"
							value={ref.role}
							disabled={readonly}
							onchange={(e) => changeRef(ref, { role: e.currentTarget.value as StyleRef['role'] })}
						>
							{#each REF_ROLES as role (role)}<option value={role}>{role}</option>{/each}
						</select>
						{#if ref.role !== 'style'}
							<input
								class="mt-1 w-full rounded border border-stone-300 px-1 py-0.5 text-xs"
								aria-label="Reference {i + 1} name"
								placeholder={ref.role === 'character' ? 'Name, e.g. Mae' : 'Name, e.g. the raft'}
								value={ref.label}
								{readonly}
								onchange={(e) => changeRef(ref, { label: e.currentTarget.value.trim() })}
							/>
						{/if}
					</li>
				{/each}
				{#each { length: uploading }, i (i)}
					<li class="grid h-36 place-items-center rounded bg-white text-xs text-stone-400">
						Uploading…
					</li>
				{/each}
				{#if !readonly && refs.length + uploading < MAX_REFS}
					<li
						class="grid h-36 place-items-center rounded border-2 border-dashed text-center text-xs text-stone-500 {dragOver
							? 'border-sky-500 bg-sky-50'
							: 'border-stone-300'}"
						ondragover={(e) => {
							e.preventDefault();
							dragOver = true;
						}}
						ondragleave={() => (dragOver = false)}
						ondrop={(e) => {
							e.preventDefault();
							dragOver = false;
							upload(e.dataTransfer?.files ?? []);
						}}
					>
						<div>
							Drop or paste images<br />or
							<label
								class="mt-1 inline-block cursor-pointer rounded border border-stone-300 bg-white px-2 py-1 focus-within:ring-2 focus-within:ring-sky-500 hover:bg-stone-50"
								bind:this={uploadButton}
								tabindex="-1"
							>
								Upload…
								<input
									type="file"
									accept="image/*"
									multiple
									class="sr-only"
									onchange={(e) => {
										upload(e.currentTarget.files ?? []);
										e.currentTarget.value = '';
									}}
								/>
							</label>
						</div>
					</li>
				{/if}
			</ul>
			{#if !readonly}
				<div class="mt-4 flex items-center gap-3">
					<button
						class="flex items-center gap-2 rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
						disabled={describing || !refs.length}
						onclick={describe}
					>
						<Sparkles size={15} />
						{describing ? 'Describing…' : 'Describe from references'}
					</button>
					<span class="text-xs text-stone-500">
						Drafts the style, palette and avoid list below from the images. Replaces what’s there.
					</span>
				</div>
				{#if describeError}
					<p class="mt-2 text-sm text-red-700" role="alert">{describeError}</p>
				{/if}
			{/if}
		</section>

		<fieldset class="space-y-6" disabled={describing}>
			<section>
				<label class="section block" for="style">Style</label>
				<textarea
					id="style"
					class="field h-32"
					placeholder="Medium, linework, shading, texture, lighting, mood. How it’s drawn, not what’s in it."
					bind:value={style}
					{readonly}
					oninput={() => queue({ style })}></textarea>
			</section>

			<section>
				<h2 class="section">Palette</h2>
				<ul class="flex flex-wrap items-center gap-2">
					{#each palette as c, i (i)}
						<li
							class="flex items-center gap-1 rounded bg-white py-1 pr-1 pl-1 ring-1 ring-stone-200"
						>
							<input
								type="color"
								class="h-7 w-9"
								aria-label="Colour {i + 1}{c.name ? `, ${c.name}` : ''}"
								value={c.hex}
								disabled={readonly}
								onchange={(e) =>
									setPalette(
										palette.map((p, j) => (j === i ? { ...p, hex: e.currentTarget.value } : p))
									)}
								onkeydown={(e) => {
									if (!readonly && (e.key === 'Delete' || e.key === 'Backspace')) {
										e.preventDefault();
										setPalette(palette.filter((_, j) => j !== i));
									}
								}}
							/>
							<input
								class="w-24 rounded border border-transparent px-1 text-xs hover:border-stone-300"
								aria-label="Colour {i + 1} name"
								placeholder={c.hex}
								value={c.name ?? ''}
								{readonly}
								onchange={(e) =>
									setPalette(
										palette.map((p, j) =>
											j === i
												? {
														hex: p.hex,
														...(e.currentTarget.value.trim() && {
															name: e.currentTarget.value.trim()
														})
													}
												: p
										)
									)}
							/>
							{#if !readonly}
								<button
									class="text-stone-400 hover:text-red-700"
									aria-label="Remove colour {i + 1}"
									onclick={() => setPalette(palette.filter((_, j) => j !== i))}
									><X size={14} /></button
								>
							{/if}
						</li>
					{/each}
					{#if !readonly}
						<li>
							<button
								class="rounded border border-dashed border-stone-300 px-3 py-1.5 text-sm text-stone-500 hover:bg-white"
								onclick={() => setPalette([...palette, { hex: '#888888' }])}>+ Colour</button
							>
						</li>
					{/if}
				</ul>
			</section>

			<section>
				<label class="section block" for="avoid">Avoid</label>
				<input
					id="avoid"
					class="field"
					placeholder="e.g. photorealism, gradients, lettering in the image"
					bind:value={avoid}
					{readonly}
					oninput={() => queue({ avoid })}
				/>
			</section>
		</fieldset>
	</main>
</div>

<style lang="postcss">
	@reference "../../../layout.css";
	.section {
		@apply mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase;
	}
	.field {
		@apply w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm read-only:bg-stone-50;
	}
</style>
