<!--
  Who has access to a comic. The owner invites existing accounts by email and removes editors;
  an editor sees the list and can leave. A native modal <dialog>: focus is trapped, Esc closes,
  and focus returns to the Share button (see EditorApp).
-->
<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { onMount, tick } from 'svelte';
	import { invite, listPeople, removePerson, type Person } from '$lib/persistence/sharing';

	let {
		supabase,
		comicId,
		userId,
		title,
		onclose,
		onleft
	}: {
		supabase: SupabaseClient;
		comicId: string;
		userId: string;
		title: string;
		onclose: () => void;
		/** This user left the comic. */
		onleft: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement>();
	let emailInput = $state<HTMLInputElement>();
	let done = $state<HTMLButtonElement>();
	let people = $state<Person[] | null>(null);
	let email = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	const isOwner = $derived(people?.some((p) => p.userId === userId && p.role === 'owner') ?? false);

	onMount(async () => {
		dialog?.showModal();
		try {
			people = await listPeople(supabase, comicId);
		} catch (e) {
			error = (e as Error).message;
		}
		await tick();
		(isOwner ? emailInput : done)?.focus();
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!email.trim() || busy) return;
		busy = true;
		error = null;
		try {
			const person = await invite(supabase, comicId, email);
			if (!people?.some((p) => p.userId === person.userId)) people = [...(people ?? []), person];
			email = '';
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
			emailInput?.focus();
		}
	}

	async function remove(person: Person, index: number) {
		busy = true;
		error = null;
		try {
			await removePerson(supabase, comicId, person.userId);
			if (person.userId === userId) return onleft();
			people = (people ?? []).filter((p) => p.userId !== person.userId);
			await tick();
			// Focus the next row's Remove, or the email field.
			const buttons = dialog?.querySelectorAll<HTMLButtonElement>('[data-remove]');
			(buttons?.[index - 1] ?? buttons?.[index - 2] ?? emailInput)?.focus();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	const initials = (email: string) =>
		email
			.split('@')[0]
			.split(/[._-]+/)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('')
			.slice(0, 2);
</script>

<dialog
	bind:this={dialog}
	class="m-auto w-[28rem] max-w-[calc(100vw-2rem)] rounded-lg p-0 text-sm text-stone-800 shadow-xl backdrop:bg-black/30"
	aria-labelledby="share-title"
	{onclose}
>
	<div class="p-5">
		<div class="mb-4 flex items-center">
			<h2 id="share-title" class="flex-1 text-base font-semibold">Share “{title}”</h2>
			<button
				class="rounded px-2 text-lg text-stone-500 hover:bg-stone-100"
				aria-label="Close"
				onclick={() => dialog?.close()}>✕</button
			>
		</div>

		{#if isOwner}
			<form class="mb-1 flex gap-2" onsubmit={submit}>
				<label class="sr-only" for="share-email">Invite by email</label>
				<input
					id="share-email"
					bind:this={emailInput}
					bind:value={email}
					type="email"
					placeholder="Invite by email"
					autocomplete="off"
					class="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1.5"
					aria-describedby={error ? 'share-error' : undefined}
				/>
				<button
					class="rounded bg-stone-900 px-3 py-1.5 text-white disabled:opacity-50"
					disabled={busy}
				>
					Invite
				</button>
			</form>
		{/if}
		{#if error}
			<p id="share-error" class="mb-2 text-amber-700" role="alert">⚠ {error}</p>
		{/if}

		<h3 class="mt-4 mb-2 text-xs font-medium tracking-wide text-stone-500 uppercase">
			People with access
		</h3>
		{#if !people}
			<p class="text-stone-500">Loading…</p>
		{:else}
			<ul class="space-y-2" aria-label="People with access">
				{#each people as person, i (person.userId)}
					<li class="flex items-center gap-2">
						<span
							class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-stone-200 text-xs font-semibold"
							aria-hidden="true">{initials(person.email)}</span
						>
						<span class="min-w-0 flex-1 truncate">
							{person.email}{person.userId === userId ? ' (you)' : ''}
						</span>
						{#if person.role === 'owner'}
							<span class="text-stone-500">Owner</span>
						{:else if isOwner}
							<button
								data-remove
								class="rounded px-2 py-0.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
								disabled={busy}
								aria-label="Remove {person.email}"
								onclick={() => remove(person, i)}>Remove</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<div class="mt-5 flex justify-end gap-2">
			{#if people && !isOwner}
				<button
					class="rounded border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
					disabled={busy}
					onclick={() =>
						remove(
							people!.find((p) => p.userId === userId)!,
							0
						)}>Leave comic</button
				>
			{/if}
			<button
				bind:this={done}
				class="rounded bg-stone-100 px-3 py-1.5 hover:bg-stone-200"
				onclick={() => dialog?.close()}>Done</button
			>
		</div>
	</div>
</dialog>
