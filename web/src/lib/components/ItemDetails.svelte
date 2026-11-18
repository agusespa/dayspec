<!-- What an opened timeline row shows: its time range, category, conditions, note, links, edit and calendar links. -->
<script lang="ts" module>
	import type { ResolvedItem } from '#lib/routine/resolve.ts';
	import { googleCalendarUrl } from '#lib/routine/calendar.ts';

	/** "09:00–09:30", with ≈ for approximate times; nothing for untimed items. */
	export function timeRange(start: string | undefined, end: string | undefined, approx = false) {
		if (!start) return undefined;
		return `${approx ? '≈' : ''}${start}${end ? `–${end}` : ''}`;
	}

	/** Whether opening the row would show anything, so rows with nothing to add get no chevron. */
	export function hasDetails(item: ResolvedItem, calendarDate?: string, showConditions = true): boolean {
		return (
			!!item.time ||
			!!item.categoryName ||
			(showConditions && item.conditions.length > 0) ||
			!!item.note ||
			item.links.length > 0 ||
			(!!calendarDate && !!googleCalendarUrl(calendarDate, [item]))
		);
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
	const canAddToCalendar = $derived(!!calendarDate && !!googleCalendarUrl(calendarDate, [item]));
</script>

<div class="details" data-testid="ItemDetails">
	{#if range || item.categoryName || canAddToCalendar || canEdit}
		<div class="facts">
			{#if range}<span class="range mono" data-testid="ItemDetails-range">{range}</span>{/if}
			{#if item.categoryName}<span class="category" data-testid="ItemDetails-category"
					><span class="swatch" aria-hidden="true"></span><span class="name">{item.categoryName}</span></span
				>{/if}
			<span class="actions">
				{#if canEdit}<EditLink
						source={item.source!}
						template={editTemplate}
						label={`Edit ${item.title}`}
					/>{/if}
				{#if calendarDate}<CalendarLink date={calendarDate} items={[item]} title={item.title} />{/if}
			</span>
		</div>
	{/if}
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
		gap: 0.3rem;
		margin: -0.35rem 0 0.55rem var(--indent);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	p {
		margin: 0;
	}
	.facts {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		min-height: 36px;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.range {
		color: var(--text);
	}
	.range {
		flex: none;
	}
	/* One line: a long category name shortens rather than pushing the calendar link down. */
	.category {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
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
		min-height: 32px;
		font-family: var(--sans);
		font-size: var(--text-xs);
		font-weight: 500;
	}
</style>
