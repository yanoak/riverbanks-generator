<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		error,
		notice,
		children,
		footer
	}: {
		title: string;
		error?: string | null;
		notice?: string | null;
		children: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<main class="grid min-h-screen place-items-center bg-stone-100 px-4 text-stone-900">
	<div class="w-full max-w-sm">
		<p class="mb-6 text-center text-lg font-semibold tracking-tight">Riverbanks</p>
		<section class="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
			<h1 class="mb-4 text-xl font-semibold">{title}</h1>
			{#if error}
				<p class="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" tabindex="-1">
					{error}
				</p>
			{/if}
			{#if notice}
				<p class="mb-4 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
					{notice}
				</p>
			{/if}
			{@render children()}
		</section>
		{#if footer}
			<p class="mt-4 text-center text-sm text-stone-500">{@render footer()}</p>
		{/if}
	</div>
</main>

<style lang="postcss">
	@reference "../../routes/layout.css";
	:global(.auth-field) {
		@apply mb-3 block text-sm;
	}
	:global(.auth-field input) {
		@apply mt-1 block w-full rounded border border-stone-300 px-3 py-2 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none;
	}
	:global(.auth-submit) {
		@apply mt-2 w-full rounded bg-stone-900 px-3 py-2 font-medium text-white hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none disabled:opacity-50;
	}
	:global(.auth-link) {
		@apply text-sky-700 underline-offset-2 hover:underline;
	}
</style>
