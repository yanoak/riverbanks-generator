<!--
  The Inspector's Generate block for one panel: its prompt (saved on the panel, so everyone
  sees it), a model, Generate (⌘Enter), and the panel's earlier takes. The server generates and
  stores the image; placing it here makes it an undoable step like any other edit.
-->
<script lang="ts" module>
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { ModelOption } from '$lib/generation/models';

	export interface GenerationContext {
		comicId: string;
		supabase: SupabaseClient;
		models: ModelOption[];
	}
</script>

<script lang="ts">
	import type { Editor } from '$lib/editor/editor.svelte';
	import { nearestAspect } from '$lib/generation/aspect';
	import { matchCast, resolveCast } from '$lib/generation/cast';
	import { DEFAULT_MODEL, PRINT_MODEL, VECTOR_MODELS } from '$lib/generation/models';
	import { pending } from '$lib/generation/pending.svelte';
	import { panelBox } from '$lib/geometry/panel';
	import type { Panel } from '$lib/model/types';
	import { assetUrl } from '$lib/persistence/assets.svelte';
	import type { StyleSummary } from '$lib/styles/styles';

	let {
		editor,
		panel,
		gen,
		style
	}: { editor: Editor; panel: Panel; gen: GenerationContext; style?: StyleSummary } = $props();

	interface Take {
		id: string;
		asset_id: string;
		width: number;
		height: number;
		prompt: string;
		quality: 'draft' | 'print';
		model: string;
	}

	// svelte-ignore state_referenced_locally
	let text = $state(panel.prompt ?? '');
	let focused = $state(false);
	let takes = $state<Take[]>([]);
	let notice = $state('');
	let now = $state(Date.now());
	let textarea = $state<HTMLTextAreaElement>();

	const pick = (key: string | null | undefined) => gen.models.find((m) => m.key === key);
	// svelte-ignore state_referenced_locally
	let modelKey = $state((pick(style?.model) ?? pick(DEFAULT_MODEL) ?? gen.models[0])?.key ?? '');
	const model = $derived(pick(modelKey));
	const aspect = $derived.by(() => {
		if (!model) return '';
		const box = panelBox(editor.page, panel);
		return model.anyAspect ? 'exact' : nearestAspect(box, model.aspects);
	});
	// The style's cast this panel gets: whoever the prompt names, until someone picks by hand.
	const castList = $derived(style?.cast ?? []);
	const castAuto = $derived(panel.cast === undefined);
	const castChips = $derived(
		castAuto ? matchCast(text, castList) : resolveCast('', castList, panel.cast)
	);
	const castSpare = $derived(castList.filter((m) => !castChips.some((c) => c.id === m.id)));
	let castBox = $state<HTMLElement>();

	function setCast(ids: string[] | undefined, label: string) {
		editor.patch(label, panel.id, { cast: ids });
	}
	function removeCast(id: string, i: number) {
		setCast(
			castChips.filter((c) => c.id !== id).map((c) => c.id),
			'Remove from panel cast'
		);
		queueMicrotask(() => {
			const chips = castBox?.querySelectorAll<HTMLElement>('[data-cast-chip]');
			(
				chips?.[Math.min(i, chips.length - 1)] ?? castBox?.querySelector<HTMLElement>('select')
			)?.focus();
		});
	}
	function addCast(id: string) {
		if (!id) return;
		setCast([...castChips.map((c) => c.id), id], 'Add to panel cast');
	}

	const job = $derived(pending.get(panel.id));
	const busy = $derived(!!job && !job.error);

	// A collaborator's edit to the prompt shows up, unless we're typing in it.
	$effect(() => {
		const remote = panel.prompt ?? '';
		if (!focused) text = remote;
	});

	$effect(() => {
		if (!busy) return;
		const timer = setInterval(() => (now = Date.now()), 500);
		return () => clearInterval(timer);
	});

	$effect(() => {
		loadTakes(panel.id);
	});

	async function loadTakes(panelId: string) {
		const { data } = await gen.supabase
			.from('generations')
			.select('id, asset_id, width, height, prompt, quality, model')
			.eq('comic_id', gen.comicId)
			.eq('panel_id', panelId)
			.eq('status', 'done')
			.order('created_at', { ascending: false })
			.limit(12);
		if (panelId === panel.id) takes = (data ?? []) as Take[];
	}

	function savePrompt() {
		focused = false;
		const next = text.trim();
		if (next !== (panel.prompt ?? ''))
			editor.patch('Edit prompt', panel.id, { prompt: next || undefined });
	}

	async function generate() {
		const prompt = text.trim();
		if (!prompt || busy || !model) return;
		const panelId = panel.id;
		const box = panelBox(editor.page, panel);
		notice = '';
		pending.set(panelId, { started: Date.now() });
		now = Date.now();
		try {
			const res = await fetch('/api/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					comicId: gen.comicId,
					panelId,
					prompt,
					profileId: style?.id,
					model: model.key,
					box: { w: box.w, h: box.h }
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.message ?? `Generating failed (HTTP ${res.status}).`);
			pending.delete(panelId);
			const placed = editor.placeStoredImage(
				panelId,
				{
					assetId: body.assetId,
					naturalWidth: body.naturalWidth,
					naturalHeight: body.naturalHeight
				},
				{ prompt }
			);
			if (!placed) editor.say('The panel was removed while its image was generating.');
			if (body.dropped && panelId === panel.id)
				notice = `${body.dropped} reference image${body.dropped > 1 ? 's were' : ' was'} left out: ${model.label} takes up to ${model.maxRefs}.`;
			if (panelId === panel.id) loadTakes(panelId);
		} catch (e) {
			pending.set(panelId, { started: 0, error: (e as Error).message });
		}
	}

	/** Redraw the panel's current image at 4K for print, keeping its framing. */
	async function makePrint() {
		const from = panel.image?.assetId;
		if (!from || busy) return;
		const panelId = panel.id;
		const box = panelBox(editor.page, panel);
		notice = '';
		pending.set(panelId, { started: Date.now(), print: true });
		now = Date.now();
		try {
			const res = await fetch('/api/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					comicId: gen.comicId,
					panelId,
					prompt: panel.prompt || 'print version',
					box: { w: box.w, h: box.h },
					quality: 'print',
					sourceAssetId: from
				})
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok)
				throw new Error(body.message ?? `The print version failed (HTTP ${res.status}).`);
			pending.delete(panelId);
			const stored = {
				assetId: body.assetId,
				naturalWidth: body.naturalWidth,
				naturalHeight: body.naturalHeight
			};
			if (!editor.placePrintVersion(panelId, from, stored))
				editor.say('The print version is in Takes: the panel shows a different image now.');
			if (panelId === panel.id) loadTakes(panelId);
		} catch (e) {
			pending.set(panelId, { started: 0, error: (e as Error).message, print: true });
		}
	}

	function useTake(take: Take) {
		if (panel.image?.assetId === take.asset_id) return;
		editor.placeStoredImage(
			panel.id,
			{ assetId: take.asset_id, naturalWidth: take.width, naturalHeight: take.height },
			{ prompt: take.prompt },
			'Use earlier take'
		);
		text = take.prompt;
	}

	function onTakeKey(e: KeyboardEvent, i: number) {
		const step =
			e.key === 'ArrowRight' || e.key === 'ArrowDown'
				? 1
				: e.key === 'ArrowLeft' || e.key === 'ArrowUp'
					? -1
					: 0;
		if (!step) return;
		e.preventDefault();
		e.stopPropagation();
		const next = (i + step + takes.length) % takes.length;
		useTake(takes[next]);
		(e.currentTarget as HTMLElement).parentElement
			?.querySelectorAll<HTMLElement>('[role=radio]')
			[next]?.focus();
	}

	function onPromptKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			generate();
		} else if (e.key === 'Escape') {
			// Back to the panel on the canvas, with the prompt saved.
			e.preventDefault();
			e.stopPropagation();
			textarea?.blur();
			document.querySelector<SVGElement>(`[data-panel-id="${panel.id}"]`)?.focus();
		}
	}

	const current = $derived(takes.findIndex((t) => t.asset_id === panel.image?.assetId));
	const isPrint = $derived(takes[current]?.quality === 'print');
	/** SVG sketches are vector: nothing to make a print version of. */
	const isVector = $derived(VECTOR_MODELS.has(takes[current]?.model ?? ''));
	const canPrint = $derived(gen.models.some((m) => m.key === PRINT_MODEL));
</script>

<section class="mb-4" aria-label="Generate">
	<h3 class="mb-1 flex items-baseline justify-between text-xs text-stone-500">
		<span>Generate</span>
		<span class="truncate pl-2">{style ? style.name : 'No style'}</span>
	</h3>
	<textarea
		bind:this={textarea}
		bind:value={text}
		data-prompt
		aria-label="Prompt"
		aria-keyshortcuts="g"
		placeholder="What happens in this panel? (G)"
		class="h-20 w-full resize-y rounded border border-stone-300 px-2 py-1.5 text-sm"
		onfocus={() => (focused = true)}
		onblur={savePrompt}
		onkeydown={onPromptKey}></textarea>
	{#if castList.length}
		<div class="mt-1" bind:this={castBox} role="group" aria-label="Cast in this panel">
			<p class="mb-0.5 flex items-baseline justify-between text-xs text-stone-500">
				<span>Cast <span class="text-stone-400">{castAuto ? 'auto' : 'custom'}</span></span>
				{#if !castAuto}
					<button
						class="underline hover:text-stone-700"
						title="Go back to whoever the prompt names"
						onclick={() => setCast(undefined, 'Detect panel cast')}>↺ Auto</button
					>
				{/if}
			</p>
			<div class="flex flex-wrap items-center gap-1">
				{#each castChips as m, i (m.id)}
					<button
						data-cast-chip
						class="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700 hover:bg-stone-200"
						aria-label="Remove {m.name} from this panel"
						title="Remove {m.name} (Backspace)"
						onclick={() => removeCast(m.id, i)}
						onkeydown={(e) => {
							if (e.key === 'Backspace' || e.key === 'Delete') {
								e.preventDefault();
								e.stopPropagation();
								removeCast(m.id, i);
							}
						}}>{m.name} ✕</button
					>
				{:else}
					<span class="text-xs text-stone-400">Nobody named yet</span>
				{/each}
				{#if castSpare.length}
					<select
						class="rounded border border-stone-300 px-1 py-0.5 text-xs text-stone-600"
						aria-label="Add to this panel’s cast"
						value=""
						onchange={(e) => {
							addCast(e.currentTarget.value);
							e.currentTarget.value = '';
						}}
					>
						<option value="">+ Add</option>
						{#each castSpare as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
					</select>
				{/if}
			</div>
		</div>
	{/if}
	{#if gen.models.length}
		<div class="mt-1 flex items-center gap-2">
			<select
				class="min-w-0 flex-1 rounded border border-stone-300 px-1 py-0.5 text-xs"
				aria-label="Model"
				bind:value={modelKey}
				title={model?.note}
			>
				{#each gen.models as m (m.key)}<option value={m.key}>{m.label}</option>{/each}
			</select>
			<span
				class="text-xs text-stone-500 tabular-nums"
				title={model?.anyAspect
					? 'Drawn at the panel’s exact shape'
					: 'Aspect ratio sent to the model'}>{aspect}</span
			>
		</div>
		<button
			class="mt-2 w-full rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
			disabled={busy || !text.trim()}
			aria-keyshortcuts="Meta+Enter"
			onclick={generate}
		>
			{busy
				? `Generating… ${Math.max(0, Math.round((now - job!.started) / 1000))} s`
				: 'Generate ⌘↵'}
		</button>
	{:else}
		<p class="mt-1 text-xs text-amber-700">
			No image models are set up on this server (GEMINI_API_KEY is missing).
		</p>
	{/if}
	{#if job?.error}
		<p class="mt-2 text-xs text-red-700" role="alert">
			{job.error}
			<button class="ml-1 underline" onclick={job.print ? makePrint : generate}>Retry</button>
		</p>
	{/if}
	{#if notice}<p class="mt-2 text-xs text-stone-500" role="status">{notice}</p>{/if}

	{#if takes.length}
		<p class="mt-3 mb-1 text-xs text-stone-500">Takes</p>
		<div class="flex flex-wrap gap-1" role="radiogroup" aria-label="Takes">
			{#each takes as take, i (take.id)}
				<button
					role="radio"
					aria-checked={i === current}
					aria-label="Take {takes.length - i}{take.quality === 'print'
						? ' (4K print)'
						: VECTOR_MODELS.has(take.model)
							? ' (SVG sketch)'
							: ''}: {take.prompt}"
					title={take.prompt}
					tabindex={i === (current < 0 ? 0 : current) ? 0 : -1}
					class="relative h-12 w-12 overflow-hidden rounded {i === current
						? 'ring-2 ring-sky-500'
						: 'ring-1 ring-stone-200 hover:ring-stone-400'}"
					onclick={() => useTake(take)}
					onkeydown={(e) => onTakeKey(e, i)}
				>
					{#if assetUrl(take.asset_id)}
						<img src={assetUrl(take.asset_id)} alt="" class="h-full w-full object-cover" />
					{/if}
					{#if take.quality === 'print' || VECTOR_MODELS.has(take.model)}
						<span
							class="absolute right-0.5 bottom-0.5 rounded bg-stone-900/80 px-1 text-[9px] font-semibold text-white"
							>{take.quality === 'print' ? '4K' : 'SVG'}</span
						>
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	{#if panel.image && canPrint && !isVector}
		<button
			class="mt-3 w-full rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
			disabled={busy || isPrint}
			title="Redraw this image at 4K for print, changing nothing (Nano Banana 2, about $0.15)"
			onclick={makePrint}
		>
			{isPrint ? 'Print version ✓' : 'Print version (4K)'}
		</button>
	{/if}
</section>
