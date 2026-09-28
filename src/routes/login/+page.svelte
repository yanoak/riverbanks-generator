<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';

	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Sign in — Riverbanks</title></svelte:head>

<AuthCard title="Sign in" error={form?.error ?? data.error} notice={data.notice}>
	<form
		method="POST"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<label class="auth-field">
			Email
			<!-- svelte-ignore a11y_autofocus -->
			<input
				name="email"
				type="email"
				autocomplete="email"
				required
				autofocus
				value={form?.email ?? ''}
			/>
		</label>
		<label class="auth-field">
			Password
			<input name="password" type="password" autocomplete="current-password" required />
		</label>
		<button class="auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
	</form>
	{#snippet footer()}
		Riverbanks is an internal tool for the seapunk team. Ask an admin for an account, or to reset a
		forgotten password.
	{/snippet}
</AuthCard>
