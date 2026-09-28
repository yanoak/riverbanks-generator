<script lang="ts">
	import AuthCard from '$lib/components/AuthCard.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Allow access — Riverbanks</title></svelte:head>

<AuthCard title="{data.client.name} wants to use your Riverbanks account" error={form?.error}>
	<p class="mb-3 text-sm text-stone-600">
		Signed in as <strong>{data.email}</strong>. If you allow it, {data.client.name} can:
	</p>
	<ul class="mb-4 list-disc space-y-1 pl-5 text-sm">
		<li>Read, create, edit and delete your comics</li>
		{#each data.scopes as scope (scope)}<li>{scope}</li>{/each}
	</ul>
	<p class="mb-4 text-xs text-stone-500">
		You'll be sent back to <code>{data.redirectHost}</code>. Only allow applications you trust.
	</p>
	<div class="flex gap-3">
		<form method="POST" action="?/deny" class="flex-1">
			<input type="hidden" name="authorization_id" value={data.authorizationId} />
			<button class="w-full rounded border border-stone-300 px-3 py-2 hover:bg-stone-50"
				>Deny</button
			>
		</form>
		<form method="POST" action="?/approve" class="flex-1">
			<input type="hidden" name="authorization_id" value={data.authorizationId} />
			<!-- svelte-ignore a11y_autofocus -->
			<button class="auth-submit mt-0" autofocus>Allow</button>
		</form>
	</div>
</AuthCard>
