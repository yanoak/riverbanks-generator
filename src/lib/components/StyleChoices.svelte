<!--
  Pick a style profile, or none: a native radio group, so ↑/↓ move the choice and Tab leaves.
-->
<script lang="ts">
	import type { StyleSummary } from '$lib/styles/styles';

	let {
		styles,
		value = $bindable(''),
		name = 'style'
	}: { styles: StyleSummary[]; value?: string; name?: string } = $props();
</script>

<div role="radiogroup" aria-label="Style" class="max-h-72 space-y-1 overflow-y-auto">
	{#each [...styles, null] as s (s?.id ?? '')}
		<label
			class="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-stone-50 has-checked:bg-sky-50"
		>
			<input type="radio" {name} value={s?.id ?? ''} bind:group={value} />
			<span class="flex-1 truncate">{s?.name ?? 'No style'}</span>
			{#if s}
				<span class="flex h-3 gap-0.5" aria-hidden="true">
					{#each s.palette.slice(0, 6) as c (c.hex)}
						<span class="w-3 rounded-sm" style:background={c.hex}></span>
					{/each}
				</span>
			{/if}
		</label>
	{/each}
</div>
{#if !styles.length}
	<p class="mt-2 text-xs text-stone-500">
		No styles yet — <a class="underline" href="/styles">make one</a> from reference images.
	</p>
{/if}
