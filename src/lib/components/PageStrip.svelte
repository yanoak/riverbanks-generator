<script lang="ts">
	import type { Editor } from '$lib/editor/editor.svelte';
	import PageView from './PageView.svelte';
	import { resolveBands } from '$lib/model/bands';
	import type { Typography } from '$lib/typography/typography';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Plus from '@lucide/svelte/icons/plus';

	let { editor, typography }: { editor: Editor; typography: Typography } = $props();
	const THUMB_WIDTH = 88;
	const peersOn = (pageId: string) =>
		(editor.presence?.peers ?? []).filter((p) => p.page === pageId);

	// Deleting a page takes everything on it, so it asks first. The question belongs to one
	// page: moving to another page (or the page going away) withdraws it.
	let confirmingId = $state<string | null>(null);
	$effect(() => {
		if (confirmingId !== editor.comic.pages[editor.pageIndex]?.id) confirmingId = null;
	});
	const focusOnMount = (node: HTMLElement) => node.focus();
	function cancelOnEscape(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		e.stopPropagation();
		confirmingId = null;
	}
	function confirmDelete() {
		confirmingId = null;
		editor.deletePage();
	}
</script>

<nav
	class="flex w-32 shrink-0 flex-col gap-3 overflow-y-auto border-r border-stone-200 bg-stone-50 p-3"
	aria-label="Pages"
>
	{#each editor.comic.pages as page, i (page.id)}
		<button
			class="group flex flex-col items-center gap-1 rounded p-1 text-xs text-stone-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
			class:text-stone-900={i === editor.pageIndex}
			aria-current={i === editor.pageIndex ? 'page' : undefined}
			aria-label="Page {i + 1}{peersOn(page.id).length
				? `, ${peersOn(page.id)
						.map((p) => p.user.name)
						.join(', ')} here`
				: ''}"
			onclick={() => editor.goToPage(i)}
		>
			<div
				class="pointer-events-none shadow-sm ring-1 ring-stone-300"
				class:ring-2={i === editor.pageIndex}
				class:ring-sky-500={i === editor.pageIndex}
			>
				<PageView
					{page}
					scale={THUMB_WIDTH / page.width}
					{typography}
					bands={resolveBands(editor.comic, i)}
				/>
			</div>
			<span class="flex items-center gap-1">
				{i + 1}
				{#each peersOn(page.id) as p (p.clientId)}
					<span
						class="h-2 w-2 rounded-full"
						style:background={p.user.color}
						title={p.user.name}
						aria-hidden="true"
					></span>
				{/each}
			</span>
		</button>
		{#if i === editor.pageIndex && confirmingId === page.id}
			<div
				class="-mt-2 flex flex-col items-center gap-1 text-xs"
				role="group"
				aria-label="Delete page {i + 1}?"
			>
				<span class="text-stone-600">Delete page {i + 1}?</span>
				<span class="flex gap-2">
					<button
						class="font-medium text-red-700 hover:underline"
						onkeydown={cancelOnEscape}
						onclick={confirmDelete}>Delete</button
					>
					<button
						class="text-stone-500 hover:text-stone-900"
						use:focusOnMount
						onkeydown={cancelOnEscape}
						onclick={() => (confirmingId = null)}>Cancel</button
					>
				</span>
			</div>
		{:else if i === editor.pageIndex}
			<div class="-mt-2 flex justify-center gap-0.5 text-stone-500">
				<button
					class="mini"
					aria-label="Move page up"
					title="Move up (⌥PageUp)"
					disabled={i === 0}
					onclick={() => editor.movePage(-1)}><ChevronUp size={14} /></button
				>
				<button
					class="mini"
					aria-label="Move page down"
					title="Move down (⌥PageDown)"
					disabled={i === editor.comic.pages.length - 1}
					onclick={() => editor.movePage(1)}><ChevronDown size={14} /></button
				>
				<button
					class="mini"
					aria-label="Delete page"
					title="Delete page"
					disabled={editor.comic.pages.length === 1}
					onclick={() => (confirmingId = page.id)}><Trash2 size={14} /></button
				>
			</div>
		{/if}
	{/each}
	<button
		class="flex items-center justify-center gap-1 rounded border border-dashed border-stone-300 py-2 text-xs text-stone-500 hover:bg-white"
		onclick={() => editor.addPage()}
	>
		<Plus size={14} /> Add page
	</button>
</nav>

<style lang="postcss">
	@reference "../../routes/layout.css";
	.mini {
		@apply grid h-6 w-6 place-items-center rounded hover:bg-stone-200 disabled:opacity-30 disabled:hover:bg-transparent;
	}
</style>
