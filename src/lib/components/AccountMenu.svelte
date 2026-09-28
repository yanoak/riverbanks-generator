<script lang="ts">
	let { email }: { email: string } = $props();
</script>

<form method="POST" action="/logout" class="flex items-center gap-2 text-xs text-stone-500">
	<span class="max-w-40 truncate" title={email}>{email}</span>
	<a href="/account/password" class="rounded px-2 py-1 hover:bg-stone-100">Change password</a>
	<button class="rounded px-2 py-1 hover:bg-stone-100">Sign out</button>
</form>
