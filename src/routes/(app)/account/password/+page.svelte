<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';

	let { form } = $props();
</script>

<svelte:head><title>Change password — Riverbanks</title></svelte:head>

<AuthCard title="Change password" error={form?.error}>
	<form method="POST" use:enhance>
		<label class="auth-field">
			New password <span class="text-stone-400">(8+ characters)</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				name="password"
				type="password"
				autocomplete="new-password"
				minlength="8"
				required
				autofocus
			/>
		</label>
		<button class="auth-submit">Save password</button>
	</form>
	{#snippet footer()}
		<a class="auth-link" href="/comics">Back to my comics</a>
	{/snippet}
</AuthCard>
