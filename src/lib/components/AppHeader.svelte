<script lang="ts">
	import { page } from '$app/state';
	import AccountMenu from './AccountMenu.svelte';

	let { email }: { email: string } = $props();

	const LINKS = [
		['/comics', 'Comics'],
		['/styles', 'Styles']
	] as const;
</script>

<header class="flex h-12 items-center gap-4 border-b border-stone-200 bg-white px-4">
	<span class="font-semibold tracking-tight">Riverbanks</span>
	<nav class="flex gap-1 text-sm" aria-label="Sections">
		{#each LINKS as [href, label] (href)}
			{@const current = page.url.pathname.startsWith(href)}
			<a
				{href}
				class="rounded px-2 py-1 hover:bg-stone-100 {current
					? 'font-medium text-stone-900'
					: 'text-stone-500'}"
				aria-current={current ? 'page' : undefined}>{label}</a
			>
		{/each}
	</nav>
	<div class="flex-1"></div>
	<AccountMenu {email} />
</header>
