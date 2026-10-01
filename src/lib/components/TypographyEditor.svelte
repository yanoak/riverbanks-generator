<!-- A style's lettering, one row per balloon type, each with a live sample. -->
<script lang="ts">
	import Italic from '@lucide/svelte/icons/italic';
	import CaseUpper from '@lucide/svelte/icons/case-upper';
	import type { BalloonType } from '$lib/model/types';
	import FontPicker from './FontPicker.svelte';
	import { fontNamed, nearestWeight } from '$lib/typography/fonts';
	import {
		BALLOON_TYPES,
		DEFAULT_TYPOGRAPHY,
		letteringCss,
		resolveTypography,
		type Lettering,
		type Typography
	} from '$lib/typography/typography';

	let {
		value,
		readonly = false,
		onchange
	}: {
		/** Only the types the style changed. */
		value: Partial<Typography>;
		readonly?: boolean;
		onchange: (next: Partial<Typography>) => void;
	} = $props();

	const LABELS: Record<BalloonType, string> = {
		speech: 'Speech',
		thought: 'Thought',
		whisper: 'Whisper',
		shout: 'Shout',
		caption: 'Caption',
		sfx: 'SFX'
	};
	const SAMPLES: Record<BalloonType, string> = {
		speech: 'What a day!',
		thought: 'I wonder…',
		whisper: 'psst… over here',
		shout: 'Look out!',
		caption: 'Meanwhile, by the river…',
		sfx: 'KRAK!'
	};

	const resolved = $derived(resolveTypography(value));
	const changed = $derived(BALLOON_TYPES.some((t) => t in value));

	function set(type: BalloonType, patch: Partial<Lettering>) {
		const next = { ...resolved[type], ...patch };
		const font = fontNamed(next.family)!;
		next.weight = nearestWeight(font, next.weight);
		const same = JSON.stringify(next) === JSON.stringify(DEFAULT_TYPOGRAPHY[type]);
		const rest = { ...value };
		delete rest[type];
		onchange(same ? rest : { ...rest, [type]: next });
	}
</script>

<div class="space-y-3">
	{#each BALLOON_TYPES as type (type)}
		{@const l = resolved[type]}
		{@const css = letteringCss(l)}
		{@const weights = fontNamed(l.family)!.weights}
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<span class="w-full text-sm text-stone-600 sm:w-16" id="type-{type}">{LABELS[type]}</span>
			<div class="w-44 text-sm">
				<FontPicker
					label="{LABELS[type]} font"
					value={l.family}
					disabled={readonly}
					onchange={(family) => set(type, { family })}
				/>
			</div>
			<select
				class="rounded border border-stone-300 bg-white px-1 py-1 text-sm"
				aria-label="{LABELS[type]} weight"
				value={l.weight}
				disabled={readonly || weights.length < 2}
				onchange={(e) => set(type, { weight: Number(e.currentTarget.value) })}
			>
				{#each weights as w (w)}
					<option value={w}>{w}</option>
				{/each}
			</select>
			<button
				class="toggle"
				aria-label="{LABELS[type]} italic"
				title="Italic"
				aria-pressed={l.italic}
				disabled={readonly}
				onclick={() => set(type, { italic: !l.italic })}><Italic size={15} /></button
			>
			<button
				class="toggle"
				aria-label="{LABELS[type]} capitals"
				title="All capitals"
				aria-pressed={l.uppercase}
				disabled={readonly}
				onclick={() => set(type, { uppercase: !l.uppercase })}><CaseUpper size={15} /></button
			>
			<span
				class="min-w-0 basis-full truncate text-xl leading-tight text-stone-900 sm:basis-auto sm:pl-2"
				style:font-family={css.fontFamily}
				style:font-weight={css.fontWeight}
				style:font-style={css.fontStyle}
				style:text-transform={css.textTransform}
				aria-describedby="type-{type}">{SAMPLES[type]}</span
			>
		</div>
	{/each}
	{#if !readonly && changed}
		<button
			class="text-sm text-stone-500 underline hover:text-stone-800"
			onclick={() => onchange({})}>Reset to house default</button
		>
	{/if}
</div>

<style lang="postcss">
	@reference "../../routes/layout.css";
	.toggle {
		@apply grid h-7 w-7 place-items-center rounded border border-stone-300 bg-white text-stone-500 hover:bg-stone-50 disabled:opacity-50;
	}
	.toggle[aria-pressed='true'] {
		@apply border-stone-800 bg-stone-800 text-white;
	}
</style>
