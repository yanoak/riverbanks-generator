<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	import { onMount } from 'svelte';

	let { children } = $props();

	// Tests wait for this before interacting: filling inputs before hydration gets them reset.
	onMount(() => (document.body.dataset.hydrated = 'true'));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
