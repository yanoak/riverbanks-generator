<!--
  A font menu that shows each font in its own face (a native <select> can't). Button + listbox:
  ↑/↓, Home/End and type-ahead move, Enter or Space picks, Escape or Tab closes.
-->
<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Check from '@lucide/svelte/icons/check';
	import { FONTS, fontStack } from '$lib/typography/fonts';
	import type { LetteringCss } from '$lib/typography/typography';

	interface Choice {
		value: string;
		label: string;
		css: Partial<LetteringCss>;
		/** Starts a group in the list. */
		group?: string;
	}

	let {
		value,
		label,
		inherit,
		disabled = false,
		align = 'left',
		onchange
	}: {
		/** A catalog family, or '' for the inherited choice. */
		value: string;
		/** The accessible name, e.g. "Font" or "caption font". */
		label: string;
		/** An extra first choice meaning "no font of its own", shown in the lettering it gives. */
		inherit?: { label: string; css: LetteringCss };
		disabled?: boolean;
		/** Which edge the open list lines up with. */
		align?: 'left' | 'right';
		onchange: (value: string) => void;
	} = $props();

	const choices = $derived<Choice[]>([
		...(inherit ? [{ value: '', label: inherit.label, css: inherit.css }] : []),
		...FONTS.map((f, i) => ({
			value: f.family,
			label: f.family,
			css: { fontFamily: fontStack(f.family) },
			group:
				i === 0
					? 'Rubik'
					: f.family === 'Rubik Microbe'
						? 'Rubik display'
						: f.family === 'Comic Neue'
							? 'Comic'
							: undefined
		}))
	]);
	const current = $derived(choices.find((c) => c.value === value));

	const id = $props.id();
	let open = $state(false);
	let active = $state(0);
	let button = $state<HTMLButtonElement>();
	let list = $state<HTMLUListElement>();
	let typed = '';
	let typedAt = 0;

	function show() {
		if (disabled) return;
		active = Math.max(
			0,
			choices.findIndex((c) => c.value === value)
		);
		open = true;
		queueMicrotask(() => {
			list?.focus();
			scrollActive();
		});
	}

	function close(refocus = true) {
		open = false;
		if (refocus) button?.focus();
	}

	function pick(i: number) {
		const c = choices[i];
		close();
		if (c && c.value !== value) onchange(c.value);
	}

	function scrollActive() {
		list?.querySelector(`#${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
	}

	function move(to: number) {
		active = Math.max(0, Math.min(choices.length - 1, to));
		scrollActive();
	}

	function onListKey(e: KeyboardEvent) {
		// Keep the editor's window-level shortcuts (arrows nudge, letters add balloons) out of it.
		e.stopPropagation();
		const k = e.key;
		if (k === 'ArrowDown') move(active + 1);
		else if (k === 'ArrowUp') move(active - 1);
		else if (k === 'Home') move(0);
		else if (k === 'End') move(choices.length - 1);
		// A space mid type-ahead is part of the name ("Rubik D…"); otherwise it picks.
		else if (k === 'Enter' || (k === ' ' && Date.now() - typedAt > 700)) pick(active);
		else if (k === 'Escape') close();
		else if (k === 'Tab') return close(false);
		else if (k.length === 1) {
			const now = Date.now();
			typed = (now - typedAt < 700 ? typed : '') + k.toLowerCase();
			typedAt = now;
			const hit = choices.findIndex((c) => c.label.toLowerCase().startsWith(typed));
			if (hit >= 0) move(hit);
			else return;
		} else return;
		e.preventDefault();
	}

	function onButtonKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			e.stopPropagation();
			show();
		}
	}
</script>

<div class="relative min-w-0">
	<button
		bind:this={button}
		type="button"
		class="flex w-full items-center gap-1 rounded border border-stone-300 bg-white px-2 py-1 text-left disabled:opacity-60"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label="{label}: {current?.label ?? value}"
		{disabled}
		onclick={() => (open ? close() : show())}
		onkeydown={onButtonKey}
	>
		<span
			class="min-w-0 flex-1 truncate"
			style:font-family={current?.css.fontFamily}
			style:font-weight={current?.css.fontWeight}
			style:font-style={current?.css.fontStyle}>{current?.label ?? value}</span
		>
		<ChevronDown size={14} class="shrink-0 text-stone-400" />
	</button>
	{#if open}
		<ul
			bind:this={list}
			class="absolute top-full z-50 mt-1 max-h-80 w-max max-w-56 min-w-full overflow-y-auto rounded-md border border-stone-200 bg-white py-1 shadow-lg focus:outline-none"
			class:left-0={align === 'left'}
			class:right-0={align === 'right'}
			role="listbox"
			tabindex="-1"
			aria-label={label}
			aria-activedescendant="{id}-{active}"
			onkeydown={onListKey}
			onfocusout={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node) && e.relatedTarget !== button)
					close(false);
			}}
		>
			{#each choices as c, i (c.value)}
				{#if c.group}
					<li
						class="mt-1 border-t border-stone-100 px-3 pt-2 pb-0.5 text-[11px] font-medium tracking-wide text-stone-400 uppercase first:mt-0 first:border-0"
						role="presentation"
					>
						{c.group}
					</li>
				{/if}
				<!-- Keys are handled by the listbox, which points at this option (aria-activedescendant). -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{id}-{i}"
					role="option"
					aria-selected={c.value === value}
					class="flex cursor-default items-center gap-2 px-3 py-1.5 text-base whitespace-nowrap"
					class:bg-stone-100={i === active}
					onpointerenter={() => (active = i)}
					onpointerdown={(e) => e.preventDefault()}
					onclick={() => pick(i)}
				>
					<span class="w-4 shrink-0 text-stone-500">
						{#if c.value === value}<Check size={14} />{/if}
					</span>
					<span
						class="min-w-0 truncate"
						style:font-family={c.css.fontFamily}
						style:font-weight={c.css.fontWeight}
						style:font-style={c.css.fontStyle}>{c.label}</span
					>
				</li>
			{/each}
		</ul>
	{/if}
</div>
