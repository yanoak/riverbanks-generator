<script lang="ts">
	import Redo2 from '@lucide/svelte/icons/redo-2';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Combine from '@lucide/svelte/icons/combine';
	import Split from '@lucide/svelte/icons/split';
	import SquarePlus from '@lucide/svelte/icons/square-plus';
	import Maximize from '@lucide/svelte/icons/maximize';
	import type { Editor } from '$lib/editor/editor.svelte';

	import type { BalloonType } from '$lib/model/types';

	import type { SaveStatus } from '$lib/persistence/autosave';

	import Download from '@lucide/svelte/icons/download';
	import FileText from '@lucide/svelte/icons/file-text';

	let {
		editor,
		saveStatus,
		onexportpng,
		onexportpdf
	}: {
		editor: Editor;
		saveStatus: SaveStatus;
		onexportpng: () => void;
		onexportpdf: () => void;
	} = $props();

	const SAVE_LABEL: Record<SaveStatus, string> = {
		saved: 'Saved',
		dirty: 'Unsaved',
		saving: 'Saving…',
		error: 'Save failed'
	};

	const BALLOONS: [BalloonType, string, string][] = [
		['speech', 'Speech', 'S'],
		['thought', 'Thought', 'T'],
		['whisper', 'Whisper', 'W'],
		['shout', 'Shout', 'K'],
		['caption', 'Caption', 'C'],
		['sfx', 'SFX', 'X']
	];

	const canSplit = $derived(
		editor.selectedPanels.length === 1 &&
			editor.selectedPanels[0].kind === 'grid' &&
			editor.selectedPanels[0].cells.length > 1
	);
</script>

<header
	class="flex h-12 shrink-0 items-center gap-1 border-b border-stone-200 bg-white px-3 text-sm text-stone-700"
>
	<span class="mr-2 font-semibold tracking-tight text-stone-900">Riverbanks</span>
	<input
		class="w-48 rounded px-2 py-1 text-stone-600 hover:bg-stone-100 focus:bg-stone-100 focus:outline-none"
		aria-label="Comic title"
		bind:value={editor.comic.title}
		onchange={() => editor.changed()}
	/>

	<div class="mx-2 h-6 w-px bg-stone-200"></div>

	<button
		class="tool"
		onclick={() => editor.undo()}
		disabled={!editor.history.canUndo}
		title="Undo (⌘Z){editor.history.lastCommandDescription
			? ` — ${editor.history.lastCommandDescription}`
			: ''}"
		aria-label="Undo"
	>
		<Undo2 size={16} />
	</button>
	<button
		class="tool"
		onclick={() => editor.redo()}
		disabled={!editor.history.canRedo}
		title="Redo (⇧⌘Z)"
		aria-label="Redo"
	>
		<Redo2 size={16} />
	</button>

	<div class="mx-2 h-6 w-px bg-stone-200"></div>

	<button
		class="tool"
		onclick={() => editor.merge()}
		disabled={editor.selectedPanels.length < 2}
		title="Merge selected panels (M)"
	>
		<Combine size={16} /> Merge
	</button>
	<button class="tool" onclick={() => editor.split()} disabled={!canSplit} title="Split panel (⇧M)">
		<Split size={16} /> Split
	</button>

	<div class="mx-2 h-6 w-px bg-stone-200"></div>

	<button class="tool" onclick={() => editor.addFreePanel()} title="Add a free break-out panel (P)">
		<SquarePlus size={16} /> Panel
	</button>
	<button
		class="tool"
		onclick={() => editor.splash()}
		title="Turn the whole grid into one borderless full-page panel"
	>
		<Maximize size={16} /> Full page
	</button>

	<div class="mx-2 h-6 w-px bg-stone-200"></div>

	{#each BALLOONS as [type, label, key] (type)}
		<button class="tool" onclick={() => editor.addBalloon(type)} title="Add {label} ({key})">
			{label}
		</button>
	{/each}

	<div class="flex-1"></div>

	{#if editor.status}
		<p class="mr-3 text-amber-700" role="status">{editor.status}</p>
	{/if}
	<button class="tool" onclick={onexportpng} title="Download this page as PNG (⌘E)">
		<Download size={16} /> PNG
	</button>
	<button class="tool" onclick={onexportpdf} title="Print every page, or save as PDF">
		<FileText size={16} /> PDF
	</button>
	<span
		class="w-20 text-right text-xs"
		class:text-stone-400={saveStatus !== 'error'}
		class:text-red-600={saveStatus === 'error'}
		aria-live="polite">{SAVE_LABEL[saveStatus]}</span
	>
</header>

<style lang="postcss">
	@reference "../../routes/layout.css";
	.tool {
		@apply inline-flex h-8 items-center gap-1.5 rounded px-2 hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent;
	}
</style>
