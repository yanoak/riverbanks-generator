<!--
  Download options: PDF of every page on a chosen paper size, or PNG of this page, with the
  watermark. A native modal <dialog>: focus is trapped, Esc closes, and focus returns to the
  Export button (see EditorApp). Choices are drafts until Download; Cancel drops them.
  Plan: 2026-10-13_download-modal.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { PAPERS, type ExportPrefs } from '$lib/export/paper';
	import type { WatermarkSetting } from '$lib/export/watermark';

	let {
		title,
		pageCount,
		pageNumber,
		prefs,
		watermark,
		onclose,
		ondownload
	}: {
		title: string;
		pageCount: number;
		/** The page a PNG would export, counted from 1. */
		pageNumber: number;
		prefs: ExportPrefs;
		watermark: WatermarkSetting;
		onclose: () => void;
		/** The confirmed choices; the dialog has closed by the time this runs. */
		ondownload: (prefs: ExportPrefs, watermark: WatermarkSetting) => void;
	} = $props();

	let dialog = $state<HTMLDialogElement>();
	// Drafts, seeded once from the saved choices.
	// svelte-ignore state_referenced_locally
	let format = $state(prefs.format);
	// svelte-ignore state_referenced_locally
	let paper = $state(prefs.paper);
	// svelte-ignore state_referenced_locally
	let mark = $state({ ...watermark });
	let finished = false;

	onMount(() => {
		dialog?.showModal();
		dialog?.querySelector<HTMLInputElement>('input[name="format"]:checked')?.focus();
	});

	// Download finishes here rather than on the dialog's close event: Chrome holds that event
	// back in a hidden tab, and the download shouldn't wait on it.
	function submit(e: SubmitEvent) {
		e.preventDefault();
		finished = true;
		dialog?.close();
		onclose();
		ondownload({ format, paper }, { ...mark });
	}

	/** Esc, ✕ or Cancel. */
	function closed() {
		if (!finished) onclose();
	}
</script>

<dialog
	bind:this={dialog}
	class="m-auto w-[28rem] max-w-[calc(100vw-2rem)] rounded-lg p-0 text-sm text-stone-800 shadow-xl backdrop:bg-black/30"
	aria-labelledby="export-title"
	onclose={closed}
	data-export-dialog
>
	<form class="p-5" onsubmit={submit}>
		<div class="mb-4 flex items-center">
			<h2 id="export-title" class="flex-1 text-base font-semibold">Download “{title}”</h2>
			<button
				type="button"
				class="rounded px-2 text-lg text-stone-500 hover:bg-stone-100"
				aria-label="Close"
				onclick={() => dialog?.close()}>✕</button
			>
		</div>

		<fieldset class="mb-4">
			<legend class="heading">Format</legend>
			<label class="choice">
				<input type="radio" name="format" value="pdf" bind:group={format} />
				PDF — every page ({pageCount})
			</label>
			<label class="choice">
				<input type="radio" name="format" value="png" bind:group={format} />
				PNG — this page ({pageNumber})
			</label>
		</fieldset>

		<label class="mb-4 block">
			<span class="heading">Paper size</span>
			<select
				class="block w-full rounded border border-stone-300 px-2 py-1.5 disabled:opacity-50"
				bind:value={paper}
				disabled={format === 'png'}
			>
				{#each PAPERS as p (p.id)}
					<option value={p.id}>{p.label}</option>
				{/each}
			</select>
		</label>

		<fieldset>
			<legend class="heading">Watermark</legend>
			<label class="choice">
				<input type="checkbox" bind:checked={mark.on} data-watermark-toggle />
				Add a watermark
			</label>
			<div class="mt-2 space-y-2 pl-6" class:opacity-50={!mark.on}>
				<label class="block text-xs text-stone-500">
					Text
					<input
						type="text"
						class="mt-1 block w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
						bind:value={mark.text}
						placeholder="PREVIEW"
						disabled={!mark.on}
					/>
				</label>
				<div role="radiogroup" aria-label="Style">
					<label class="choice">
						<input
							type="radio"
							name="style"
							value="edge"
							bind:group={mark.style}
							disabled={!mark.on}
						/>
						Edge <span class="text-stone-500">— small, down the margin</span>
					</label>
					<label class="choice">
						<input
							type="radio"
							name="style"
							value="diagonal"
							bind:group={mark.style}
							disabled={!mark.on}
						/>
						Diagonal <span class="text-stone-500">— across the page</span>
					</label>
				</div>
			</div>
		</fieldset>

		<div class="mt-5 flex justify-end gap-2">
			<button
				type="button"
				class="rounded bg-stone-100 px-3 py-1.5 hover:bg-stone-200"
				onclick={() => dialog?.close()}>Cancel</button
			>
			<button class="rounded bg-stone-900 px-3 py-1.5 text-white">Download</button>
		</div>
	</form>
</dialog>

<style lang="postcss">
	@reference "../../routes/layout.css";
	.heading {
		@apply mb-2 block text-xs font-medium tracking-wide text-stone-500 uppercase;
	}
	.choice {
		@apply flex items-center gap-2 py-0.5;
	}
</style>
