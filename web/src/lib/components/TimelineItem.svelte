<!-- One row of the timeline: its time, a dot on the rail, the title and duration, then note and links. Styles in timeline.css. -->
<script lang="ts" module>
	import type { ResolvedItem } from '#lib/routine/resolve.ts';

	/** What a row shows; resolved days and template outlines both have it. */
	export type TimelineEntry = ResolvedItem;

	export { itemTitle, itemMeta };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import CalendarLink from './CalendarLink.svelte';

	let {
		item,
		current,
		passed = false,
		children,
		calendarDate
	}: {
		item: TimelineEntry;
		/** Marks the item happening now, or the next one when nothing has started yet. */
		current?: 'Now' | 'Next';
		passed?: boolean;
		/** Extra content under the title, e.g. template condition labels. */
		children?: Snippet;
		calendarDate?: string;
	} = $props();
</script>

{#snippet itemTitle(item: TimelineEntry)}
	<span class="title">
		{#if item.alert}<span class="alert" aria-label="Can't be delayed">!</span
			>{/if}{item.title}{#if item.duration}<span class="duration">{item.duration} min</span>{/if}
	</span>
{/snippet}

{#snippet itemMeta(item: Pick<TimelineEntry, 'note' | 'links'>)}
	{#if item.note || item.links.length}
		<div class="meta">
			{#if item.note}<span class="note" data-testid="Activity-note">{item.note}</span>{/if}
			{#each item.links as link (link.url)}
				<a href={link.url} target="_blank" rel="noopener noreferrer"
					>{link.label}<span aria-hidden="true"> ↗</span></a
				>
			{/each}
		</div>
	{/if}
{/snippet}

<li
	data-testid="TimelineItem"
	class="item tone-{item.color ?? 'none'}"
	class:current={!!current}
	class:passed
	data-current={current ? '' : undefined}
>
	<div class="time mono">
		<span class="start" data-testid="TimelineItem-start">{`${item.approx ? '≈' : ''}${item.time ?? ''}`}</span
		>
	</div>
	<div class="body">
		<div class="row">
			<span class="dot" aria-hidden="true"></span>
			{@render itemTitle(item)}
			{#if calendarDate}<CalendarLink date={calendarDate} items={[item]} title={item.title} />{/if}
		</div>
		{@render itemMeta(item)}
		{@render children?.()}
	</div>
</li>
