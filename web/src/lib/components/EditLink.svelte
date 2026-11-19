<!-- A quiet pencil next to the calendar link: opens the template or shared block editor at this entry. -->
<script lang="ts">
	import type { ItemSource } from '#lib/routine/resolve.ts';
	let {
		source,
		template,
		label
	}: {
		/** Where the entry is defined; a block alone opens that block. */
		source: ItemSource;
		/** The day's template, for entries that aren't in a shared block. */
		template?: string;
		label: string;
	} = $props();
	const href = $derived.by(() => {
		const params = new URLSearchParams();
		if (source.block) params.set('block', source.block);
		else if (template) params.set('t', template);
		else return undefined;
		if (source.path.length) params.set('edit', source.path.join('.'));
		return `/templates?${params}`;
	});
</script>

{#if href}
	<a class="edit-link" {href} aria-label={label} title="Edit" data-testid="EditLink">
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M4 20h4L19 9l-4-4L4 16v4Z" />
			<path d="m13.5 6.5 4 4" />
		</svg>
	</a>
{/if}

<style>
	.edit-link {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		color: var(--muted);
	}
	.edit-link:hover {
		background: var(--surface-hover);
	}
	svg {
		width: 18px;
		height: 18px;
	}
</style>
