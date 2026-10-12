<!--
  A toolbar button that opens a panel of controls below it (the disclosure pattern, so the
  panel can hold fields as well as commands). Opening focuses the first control; ↑/↓, Home and
  End move between controls; Escape, or Enter in a text field, closes it and refocuses the
  button; a click outside closes it. A control marked data-close closes the panel once it's
  used; data-close="refocus" also returns focus to the button, for commands that don't move
  it somewhere useful themselves. Plan: 2026-10-12_toolbar-menus.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	let {
		label,
		title,
		align = 'left',
		active = false,
		children
	}: {
		/** The button's content (icon and text). */
		label: Snippet;
		title: string;
		align?: 'left' | 'right';
		/** Tint the button, e.g. while a setting inside is on. */
		active?: boolean;
		children: Snippet;
	} = $props();

	const id = $props.id();
	let open = $state(false);
	let button = $state<HTMLButtonElement>();

	const CONTROLS = 'button:not(:disabled), input:not(:disabled)';

	function close(refocus: boolean) {
		open = false;
		if (refocus) button?.focus();
	}

	function panel(node: HTMLElement) {
		node.querySelector<HTMLElement>(CONTROLS)?.focus();
		const controls = () => [...node.querySelectorAll<HTMLElement>(CONTROLS)];
		const onkey = (e: KeyboardEvent) => {
			const typing = e.target instanceof HTMLInputElement && e.target.type === 'text';
			const all = controls();
			const at = all.indexOf(document.activeElement as HTMLElement);
			const go = (i: number) => all[(i + all.length) % all.length]?.focus();
			if (e.key === 'Escape' || (e.key === 'Enter' && typing)) close(true);
			else if (e.key === 'ArrowDown' && !typing) go(at + 1);
			else if (e.key === 'ArrowUp' && !typing) go(at - 1);
			else if (e.key === 'Home' && !typing) go(0);
			else if (e.key === 'End' && !typing) go(-1);
			else return;
			// Keep the editor's own keys (deselect, nudge) out of it.
			e.preventDefault();
			e.stopPropagation();
		};
		const onclick = (e: MouseEvent) => {
			const item = (e.target as HTMLElement).closest<HTMLElement>('[data-close]');
			if (item) close(item.dataset.close === 'refocus');
		};
		const onpointer = (e: PointerEvent) => {
			if (!node.parentElement?.contains(e.target as Node)) close(false);
		};
		node.addEventListener('keydown', onkey);
		node.addEventListener('click', onclick);
		document.addEventListener('pointerdown', onpointer, true);
		return () => {
			node.removeEventListener('keydown', onkey);
			node.removeEventListener('click', onclick);
			document.removeEventListener('pointerdown', onpointer, true);
		};
	}
</script>

<div class="relative">
	<button
		class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded px-2 whitespace-nowrap hover:bg-stone-100"
		class:bg-sky-100={active}
		class:text-sky-800={active}
		bind:this={button}
		{title}
		aria-expanded={open}
		aria-controls={id}
		onclick={() => (open = !open)}
	>
		{@render label()}<ChevronDown size={14} class="-ml-0.5 text-stone-400" />
	</button>
	{#if open}
		<div
			{id}
			class="absolute top-full z-50 mt-1 min-w-48 rounded border border-stone-200 bg-white py-1 text-sm shadow-lg"
			class:left-0={align === 'left'}
			class:right-0={align === 'right'}
			{@attach panel}
		>
			{@render children()}
		</div>
	{/if}
</div>
