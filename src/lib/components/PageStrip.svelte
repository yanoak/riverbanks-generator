<script lang="ts">
	import type { Editor } from '$lib/editor/editor.svelte';
	import PageView from './PageView.svelte';

	let { editor }: { editor: Editor } = $props();
	const THUMB_WIDTH = 88;
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
			aria-label="Page {i + 1}"
			onclick={() => editor.goToPage(i)}
		>
			<div
				class="pointer-events-none shadow-sm ring-1 ring-stone-300"
				class:ring-2={i === editor.pageIndex}
				class:ring-sky-500={i === editor.pageIndex}
			>
				<PageView {page} scale={THUMB_WIDTH / page.width} />
			</div>
			{i + 1}
		</button>
	{/each}
</nav>
