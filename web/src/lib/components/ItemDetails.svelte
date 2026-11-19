<!-- What an opened timeline row shows: its duration, time range, category, conditions, note, links, edit and calendar links. -->
<script lang="ts" module>
	import type { ResolvedItem } from '#lib/routine/resolve.ts';

	/** "09:00–09:30", with ≈ for approximate times; nothing for untimed items. */
	export function timeRange(start: string | undefined, end: string | undefined, approx = false) {
		if (!start) return undefined;
		return `${approx ? '≈' : ''}${start}${end ? `–${end}` : ''}`;
	}
</script>

<script lang="ts">
	import CalendarLink from './CalendarLink.svelte';
	import EditLink from './EditLink.svelte';

	let {
		item,
		calendarDate,
		showConditions = true,
		editTemplate
	}: {
		item: ResolvedItem;
		calendarDate?: string;
		/** The day's template; with it the details get an edit link. */
		editTemplate?: string;
		/** Off where the conditions are already on show, as in template previews. */
		showConditions?: boolean;
	} = $props();
	const range = $derived(timeRange(item.time, item.end, item.approx));
	const canEdit = $derived(!!editTemplate && !!item.source);
</script>

<div class="details" data-testid="ItemDetails">
	<div class="facts">
		<div class="metadata">
			<span class="duration" data-testid="ItemDetails-duration">{item.duration} min</span>
			{#if range}<span class="range mono" data-testid="ItemDetails-range">{range}</span>{/if}
			{#if item.categoryName}<span class="category" data-testid="ItemDetails-category"
					><span class="swatch" aria-hidden="true"></span><span class="name">{item.categoryName}</span></span
				>{/if}
		</div>
		<span class="actions">
			{#if canEdit}<EditLink
					source={item.source!}
					template={editTemplate}
					label={`Edit ${item.title}`}
				/>{/if}
			{#if calendarDate}<CalendarLink date={calendarDate} items={[item]} title={item.title} />{/if}
		</span>
	</div>
	{#if showConditions && item.conditions.length}<p class="when" data-testid="ItemDetails-when">
			When {item.conditions.join(' · ')}
		</p>{/if}
	{#if item.note}<p class="note" data-testid="Activity-note">{item.note}</p>{/if}
	{#if item.links.length}
		<div class="links">
			{#each item.links as link (link.url)}
				<a href={link.url} target="_blank" rel="noopener noreferrer"
					>{link.label}<span aria-hidden="true"> ↗</span></a
				>
			{/each}
		</div>
	{/if}
</div>

<style>
	.details {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin: -0.9rem 0 0.2rem var(--indent);
		font-size: var(--text-sm);
		line-height: 1.4;
	}
	p {
		margin: 0;
	}
	.facts {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 32px;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.metadata {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.6rem;
		min-width: 0;
	}

	.range {
		color: var(--text);
	}
	.range {
		flex: none;
	}
	/* Metadata can wrap while edit and calendar actions keep their own space. */
	.category {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		max-width: 100%;
	}
	.name {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.swatch {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--tone);
	}
	.actions {
		display: flex;
		margin-left: auto;
		flex: none;
	}
	.when {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.note {
		color: var(--muted);
		white-space: pre-line;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.9rem;
	}
	.links a {
		display: inline-flex;
		align-items: center;
		min-height: 28px;
		font-family: var(--sans);
		font-size: var(--text-xs);
		font-weight: 500;
	}
</style>
