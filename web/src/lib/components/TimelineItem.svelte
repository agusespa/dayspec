<!-- One row of the timeline: its time, a dot on the rail, the title and duration. Tapping it shows its details (ItemDetails). Styles in timeline.css. -->
<script lang="ts" module>
	import type { ResolvedItem } from '#lib/routine/resolve.ts';

	/** What a row shows; resolved days and template outlines both have it. */
	export type TimelineEntry = ResolvedItem;

	export { itemTitle };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import ItemDetails, { hasDetails } from './ItemDetails.svelte';

	let {
		item,
		current,
		passed = false,
		children,
		calendarDate,
		showConditions = true,
		editTemplate
	}: {
		item: TimelineEntry;
		/** Marks the item happening now, or the next one when nothing has started yet. */
		current?: 'Now' | 'Next';
		passed?: boolean;
		/** Extra content under the title, e.g. template condition labels. */
		children?: Snippet;
		calendarDate?: string;
		/** Off where the conditions are already on show, as in template previews. */
		showConditions?: boolean;
		/** The day's template; with it opened rows get an edit link. */
		editTemplate?: string;
	} = $props();
	/** The time range, category, conditions, note, links and calendar link stay folded away until the row is tapped. */
	let open = $state(false);
	const expandable = $derived(hasDetails(item, calendarDate, showConditions));
</script>

{#snippet itemTitle(item: TimelineEntry)}
	<span class="title">
		{#if item.alert}<svg
				class="alert"
				role="img"
				aria-label="Alert"
				data-testid="TimelineItem-alert"
				viewBox="0 0 24 24"
				><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg
			>{/if}<span class="title-text">{item.title}</span>{#if item.duration}<span class="duration"
				>{item.duration} min</span
			>{/if}
	</span>
{/snippet}

<li
	data-testid="TimelineItem"
	class="item tone-{item.color ?? 'none'}"
	class:current={!!current}
	class:passed
	class:open
	data-current={current ? '' : undefined}
>
	<div class="time mono">
		<span class="start" data-testid="TimelineItem-start">{`${item.approx ? '≈' : ''}${item.time ?? ''}`}</span
		>
	</div>
	<div class="body">
		{#if expandable}
			<button
				type="button"
				class="row"
				data-testid="TimelineItem-toggle"
				aria-expanded={open}
				onclick={() => (open = !open)}
			>
				<span class="dot" aria-hidden="true"></span>
				{@render itemTitle(item)}
				<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
			</button>
			{#if open}<ItemDetails {item} {calendarDate} {showConditions} {editTemplate} />{/if}
		{:else}
			<div class="row">
				<span class="dot" aria-hidden="true"></span>
				{@render itemTitle(item)}
			</div>
		{/if}
		{@render children?.()}
	</div>
</li>
