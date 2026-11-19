<!-- One row of the timeline: its time, a dot on the rail, the title. Tapping it shows its details (ItemDetails). Styles in timeline.css. -->
<script lang="ts" module>
	import type { ResolvedItem } from '#lib/routine/resolve.ts';

	/** What a row shows; resolved days and template outlines both have it. */
	export type TimelineEntry = ResolvedItem;

	export { itemTitle };
</script>

<script lang="ts">
	import AlertIcon from './AlertIcon.svelte';
	import ItemDetails from './ItemDetails.svelte';

	let {
		item,
		current,
		passed = false,
		calendarDate,
		editTemplate
	}: {
		item: TimelineEntry;
		/** Marks the item happening now, or the next one when nothing has started yet. */
		current?: 'Now' | 'Next';
		passed?: boolean;
		calendarDate?: string;
		/** The day's template; with it opened rows get an edit link. */
		editTemplate?: string;
	} = $props();
	/** The time range, category, note, link and calendar link stay folded away until the row is tapped. */
	let open = $state(false);
</script>

{#snippet itemTitle(item: TimelineEntry)}
	<span class="title">
		{#if item.alert}<AlertIcon />{/if}<span class="title-text">{item.title}</span>
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
		{#if open}<ItemDetails {item} {calendarDate} {editTemplate} />{/if}
	</div>
</li>
