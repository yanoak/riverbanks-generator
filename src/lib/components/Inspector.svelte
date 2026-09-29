<script lang="ts">
	import type { Editor } from '$lib/editor/editor.svelte';
	import type { BalloonType, Panel } from '$lib/model/types';

	import type { Editor as TipTap } from '@tiptap/core';
	import Bold from '@lucide/svelte/icons/bold';
	import Italic from '@lucide/svelte/icons/italic';
	import AlignLeft from '@lucide/svelte/icons/align-left';
	import AlignCenter from '@lucide/svelte/icons/align-center';
	import AlignRight from '@lucide/svelte/icons/align-right';
	import { LETTERING_FONT, SFX_FONT } from '$lib/model/balloons';
	import type { StyleSummary } from '$lib/styles/styles';
	import StyleDialog from './StyleDialog.svelte';
	import GeneratePanel, { type GenerationContext } from './GeneratePanel.svelte';
	import { tick } from 'svelte';

	const TAILED: string[] = ['speech', 'thought', 'whisper', 'shout'];

	const FONTS: [string, string][] = [
		['Comic Neue', LETTERING_FONT],
		['Bangers', SFX_FONT],
		['Patrick Hand', "'Patrick Hand', cursive"],
		['Permanent Marker', "'Permanent Marker', cursive"]
	];

	const align = (a: string) => ({
		active: (tt: TipTap) => tt.isActive({ textAlign: a }),
		run: (tt: TipTap) => tt.chain().focus().setTextAlign(a).run()
	});
	const FORMATS = [
		{
			label: 'bold',
			title: 'Bold (⌘B)',
			icon: Bold,
			active: (tt: TipTap) => tt.isActive('bold'),
			run: (tt: TipTap) => tt.chain().focus().toggleBold().run()
		},
		{
			label: 'italic',
			title: 'Italic (⌘I)',
			icon: Italic,
			active: (tt: TipTap) => tt.isActive('italic'),
			run: (tt: TipTap) => tt.chain().focus().toggleItalic().run()
		},
		{ label: 'left', title: 'Align left', icon: AlignLeft, ...align('left') },
		{ label: 'center', title: 'Align centre', icon: AlignCenter, ...align('center') },
		{ label: 'right', title: 'Align right', icon: AlignRight, ...align('right') }
	];

	let {
		editor,
		styles,
		gen
	}: { editor: Editor; styles?: StyleSummary[]; gen?: GenerationContext } = $props();

	let choosingStyle = $state(false);
	const styleId = $derived(editor.comic.styleProfileId);
	const style = $derived(styles?.find((s) => s.id === styleId));

	const panel = $derived(editor.selectedPanels.length === 1 ? editor.selectedPanels[0] : undefined);

	function setGrid(key: 'rows' | 'cols' | 'gutter' | 'margin', e: Event) {
		const value = Number((e.currentTarget as HTMLInputElement).value);
		if (Number.isFinite(value) && value !== editor.page.grid[key]) editor.setGrid({ [key]: value });
	}

	function patchPanel(p: Panel, patch: Partial<Panel>, description: string) {
		editor.patch(description, p.id, patch);
	}
</script>

<aside
	class="w-64 shrink-0 overflow-y-auto border-l border-stone-200 bg-white p-4 text-sm text-stone-700"
	aria-label="Inspector"
>
	{#if editor.selectedBalloon}
		{@const b = editor.selectedBalloon}
		<h2 class="section">Balloon</h2>
		{#if editor.textEditor}
			{@const tt = editor.textEditor}
			{@const _tick = editor.textTick}
			<div class="mb-3 flex gap-1" role="toolbar" aria-label="Text formatting">
				{#each FORMATS as f (f.label)}
					<button
						class="fmt"
						class:active={_tick >= 0 && f.active(tt)}
						title={f.title}
						aria-label={f.title}
						aria-pressed={f.active(tt)}
						onpointerdown={(e) => e.preventDefault()}
						onclick={() => f.run(tt)}
					>
						<f.icon size={15} />
					</button>
				{/each}
			</div>
		{:else}
			<p class="mb-3 text-xs text-stone-500">Double-click or press Enter to edit the text.</p>
		{/if}
		<label class="row">
			<span>Font</span>
			<select
				class="w-32 rounded border border-stone-300 px-1 py-0.5"
				value={b.font}
				onchange={(e) => editor.patch('Font', b.id, { font: e.currentTarget.value })}
			>
				{#each FONTS as [label, value] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
		</label>
		<label class="row">
			<span>Type</span>
			<select
				class="rounded border border-stone-300 px-1 py-0.5"
				value={b.type}
				onchange={(e) =>
					editor.patch('Balloon type', b.id, {
						type: e.currentTarget.value as BalloonType,
						tail:
							b.tail ??
							(TAILED.includes(e.currentTarget.value) ? { x: b.w * 0.35, y: b.h * 1.6 } : undefined)
					})}
			>
				{#each ['speech', 'thought', 'whisper', 'shout', 'caption', 'sfx'] as t (t)}
					<option value={t}>{t}</option>
				{/each}
			</select>
		</label>
		<label class="row">
			<span>Font size</span>
			<input
				class="w-16 rounded border border-stone-300 px-2 py-0.5 text-right"
				type="number"
				min="8"
				max="200"
				value={b.fontSize}
				onchange={(e) =>
					editor.patch('Font size', b.id, { fontSize: Number(e.currentTarget.value) })}
			/>
		</label>
		<label class="row">
			<span>Fill</span>
			<input
				type="color"
				value={b.fill}
				onchange={(e) => editor.patch('Balloon fill', b.id, { fill: e.currentTarget.value })}
			/>
		</label>
		<label class="row">
			<span>Tail</span>
			<input
				type="checkbox"
				checked={!!b.tail}
				disabled={!TAILED.includes(b.type)}
				onchange={(e) =>
					editor.patch('Toggle tail', b.id, {
						tail: e.currentTarget.checked ? { x: b.w * 0.35, y: b.h * 1.6 } : undefined
					})}
			/>
		</label>
		<div class="mt-3 grid grid-cols-2 gap-2">
			<button class="btn" onclick={() => editor.reorder('front')} title="]">To front</button>
			<button class="btn" onclick={() => editor.reorder('back')} title="[">To back</button>
		</div>
		<button class="btn mt-2 text-red-700" onclick={() => editor.deleteSelection()}>
			Delete balloon
		</button>
	{:else if panel}
		<h2 class="section">Panel</h2>
		<p class="mb-3 text-stone-500">
			{panel.kind === 'grid'
				? `${panel.cells.length} cell${panel.cells.length > 1 ? 's' : ''}`
				: 'Free panel'}
		</p>
		{#if gen}
			{#key panel.id}
				<GeneratePanel {editor} {panel} {gen} {style} />
			{/key}
		{:else}
			<p class="mb-3 text-xs text-stone-500">Sign in to generate images from a prompt.</p>
		{/if}
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
		{#if styles}
			<h2 class="section">Comic</h2>
			<div class="row mb-3">
				<span>Style</span>
				<span class="flex min-w-0 items-center gap-2">
					<span class="truncate {styleId && !style ? 'text-amber-700' : ''}" data-comic-style>
						{#if style}
							<a class="hover:underline" href="/styles/{style.id}" target="_blank">{style.name}</a>
						{:else}
							{styleId ? 'Style deleted' : 'None'}
						{/if}
					</span>
					<button
						class="shrink-0 rounded border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-50"
						data-change-style
						onclick={() => (choosingStyle = true)}>Change…</button
					>
				</span>
			</div>
		{/if}
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

{#if choosingStyle && styles}
	<StyleDialog
		{styles}
		current={style ? styleId : undefined}
		onpick={(id) => editor.setStyle(id)}
		onclose={async () => {
			choosingStyle = false;
			// Once the modal is gone: until then everything outside it is inert.
			await tick();
			document.querySelector<HTMLElement>('[data-change-style]')?.focus();
		}}
	/>
{/if}

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
	.fmt {
		@apply grid h-8 w-8 place-items-center rounded border border-stone-300 hover:bg-stone-50;
	}
	.fmt.active {
		@apply border-sky-500 bg-sky-50 text-sky-700;
	}
	kbd {
		@apply rounded border border-stone-300 bg-stone-50 px-1 font-sans;
	}
</style>
