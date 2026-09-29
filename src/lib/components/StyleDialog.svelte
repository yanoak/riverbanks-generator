<!--
  Change the comic's style. A native modal <dialog>: focus starts on the current choice, Esc
  cancels, and the opener gets focus back (see Inspector).
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { StyleSummary } from '$lib/styles/styles';
	import StyleChoices from './StyleChoices.svelte';

	let {
		styles,
		current,
		onpick,
		onclose
	}: {
		styles: StyleSummary[];
		current: string | undefined;
		onpick: (id: string | undefined) => void;
		onclose: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement>();
	// svelte-ignore state_referenced_locally
	let value = $state(current ?? '');

	onMount(async () => {
		dialog?.showModal();
		await tick();
		dialog?.querySelector<HTMLInputElement>('input[type=radio]:checked')?.focus();
	});

	function submit(e: SubmitEvent) {
		e.preventDefault();
		onpick(value || undefined);
		onclose();
	}
</script>

<dialog
	bind:this={dialog}
	class="m-auto w-80 rounded-lg p-0 shadow-xl backdrop:bg-black/30"
	aria-label="Comic style"
	oncancel={(e) => {
		e.preventDefault();
		onclose();
	}}
>
	<form class="p-4 text-sm" onsubmit={submit}>
		<h2 class="mb-1 font-semibold">Comic style</h2>
		<p class="mb-3 text-xs text-stone-500">
			New images in this comic follow it. Images already made stay as they are.
		</p>
		<StyleChoices {styles} bind:value />
		<div class="mt-4 flex justify-end gap-2">
			<button type="button" class="rounded border border-stone-300 px-3 py-1.5" onclick={onclose}
				>Cancel</button
			>
			<button class="rounded bg-stone-900 px-3 py-1.5 font-medium text-white">Use style</button>
		</div>
	</form>
</dialog>
