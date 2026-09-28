<script lang="ts">
	import type { Editor } from '$lib/editor/editor.svelte';
	import { PatchCommand } from '$lib/model/commands/patch';
	import type { Panel } from '$lib/model/types';

	let { editor }: { editor: Editor } = $props();

	const panel = $derived(editor.selectedPanels.length === 1 ? editor.selectedPanels[0] : undefined);

	function setGrid(key: 'rows' | 'cols' | 'gutter' | 'margin', e: Event) {
		const value = Number((e.currentTarget as HTMLInputElement).value);
		if (Number.isFinite(value) && value !== editor.page.grid[key]) editor.setGrid({ [key]: value });
	}

	function patchPanel(p: Panel, patch: Partial<Panel>, description: string) {
		editor.run(new PatchCommand(description, p, patch));
	}
</script>

<aside
	class="w-64 shrink-0 overflow-y-auto border-l border-stone-200 bg-white p-4 text-sm text-stone-700"
	aria-label="Inspector"
>
	{#if panel}
		<h2 class="section">Panel</h2>
		<p class="mb-3 text-stone-500">
			{panel.kind === 'grid'
				? `${panel.cells.length} cell${panel.cells.length > 1 ? 's' : ''}`
				: 'Free panel'}
		</p>
		<h3 class="mt-1 mb-1 text-xs text-stone-500">Image</h3>
		{#if panel.image}
			<div class="mb-2 grid grid-cols-2 gap-2">
				<button class="btn" onclick={() => editor.fitSelectedImage('fill')}>Fill</button>
				<button class="btn" onclick={() => editor.fitSelectedImage('fit')}>Fit</button>
				<button class="btn" onclick={() => editor.enterImageMode()} title="Enter">Crop…</button>
				<button class="btn" onclick={() => editor.removeImage(panel)}>Remove</button>
			</div>
		{:else}
			<p class="mb-2 text-xs text-stone-500">Drop an image on the panel, paste with ⌘V, or:</p>
		{/if}
		<label class="btn mb-3 block cursor-pointer text-center">
			{panel.image ? 'Replace…' : 'Upload…'}
			<input
				type="file"
				accept="image/*"
				class="sr-only"
				onchange={(e) => {
					const file = e.currentTarget.files?.[0];
					if (file) editor.setImage(panel.id, file);
					e.currentTarget.value = '';
				}}
			/>
		</label>
		<label class="row">
			<span>Border</span>
			<input
				type="checkbox"
				checked={panel.border === 'solid'}
				onchange={(e) =>
					patchPanel(
						panel,
						{ border: e.currentTarget.checked ? 'solid' : 'none' },
						'Toggle border'
					)}
			/>
		</label>
		<label class="row">
			<span>Fill</span>
			<input
				type="color"
				value={panel.fill}
				onchange={(e) => patchPanel(panel, { fill: e.currentTarget.value }, 'Panel fill')}
			/>
		</label>
		{#if panel.kind === 'free'}
			<div class="mt-3 grid grid-cols-2 gap-2">
				<button class="btn" onclick={() => editor.reorder('front')} title="]">To front</button>
				<button class="btn" onclick={() => editor.reorder('back')} title="[">To back</button>
			</div>
			<button class="btn mt-2 text-red-700" onclick={() => editor.deleteSelection()}>
				Delete panel
			</button>
		{/if}
		{#if panel.kind === 'grid' && panel.cells.length > 1}
			<button class="btn mt-3" onclick={() => editor.split()}>Split panel</button>
		{/if}
	{:else if editor.selectedPanels.length > 1}
		<h2 class="section">{editor.selectedPanels.length} panels</h2>
		<button class="btn" onclick={() => editor.merge()}>Merge panels</button>
	{:else}
		<h2 class="section">Page {editor.pageIndex + 1}</h2>
		{#each [['rows', 'Rows', 1, 12], ['cols', 'Columns', 1, 12], ['gutter', 'Gutter', 0, 80], ['margin', 'Margin', 0, 200]] as const as [key, label, min, max] (key)}
			<label class="row">
				<span>{label}</span>
				<input
					class="w-16 rounded border border-stone-300 px-2 py-0.5 text-right"
					type="number"
					{min}
					{max}
					value={editor.page.grid[key]}
					onchange={(e) => setGrid(key, e)}
				/>
			</label>
		{/each}
		<p class="mt-4 text-xs leading-relaxed text-stone-500">
			Click a panel, ⇧-click or ⇧+arrow to add neighbours, then <kbd>M</kbd> to merge.
		</p>
	{/if}
</aside>

<style lang="postcss">
	@reference "../../routes/layout.css";
	.section {
		@apply mb-2 text-xs font-semibold tracking-wide text-stone-400 uppercase;
	}
	.row {
		@apply flex items-center justify-between py-1.5;
	}
	.btn {
		@apply w-full rounded border border-stone-300 px-3 py-1.5 hover:bg-stone-50;
	}
	kbd {
		@apply rounded border border-stone-300 bg-stone-50 px-1 font-sans;
	}
</style>
