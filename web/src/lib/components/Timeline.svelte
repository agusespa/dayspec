<script lang="ts" generics="T extends ResolvedItem">
	import type { Snippet } from 'svelte';
	import type { ResolvedItem } from '#lib/routine/resolve.ts';
	import { groupTimeline, timelineDuration, timelineGaps } from '#lib/routine/timeline.ts';
	import CalendarLink from './CalendarLink.svelte';
	import EditLink from './EditLink.svelte';
	import ItemDetails, { hasDetails, timeRange } from './ItemDetails.svelte';
	let {
		items,
		row,
		currentId,
		calendarDate,
		editTemplate
	}: {
		items: T[];
		row: Snippet<[T]>;
		currentId?: string;
		calendarDate?: string;
		/** The day's template; with it opened rows and blocks get edit links. */
		editTemplate?: string;
	} = $props();
	const currentIndex = $derived(items.findIndex((item) => item.id === currentId));
	const groups = $derived(groupTimeline(items));
	const gaps = $derived(timelineGaps(groups));
	/** Activities inside an open block whose details are showing, by item ID. */
	let openEntries = $state<Record<string, boolean>>({});
</script>

{#snippet contents(entries: ResolvedItem[])}
	<ul class="contents-list">
		{#each entries as item (item.id)}
			<li class="tone-{item.color ?? 'none'}" data-testid="Timeline-block-entry">
				{#if hasDetails(item, calendarDate)}
					<button
						type="button"
						class="contents-row"
						data-testid="Timeline-block-entry-toggle"
						aria-expanded={!!openEntries[item.id]}
						onclick={() => (openEntries[item.id] = !openEntries[item.id])}
						><span class="contents-title">{item.title}</span>{#if item.duration}<span
								class="duration"
								data-testid="Timeline-block-duration">{item.duration} min</span
							>{/if}<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
						></button
					>
					{#if openEntries[item.id]}<ItemDetails {item} {calendarDate} {editTemplate} />{/if}
				{:else}
					<div class="contents-row">
						<span class="contents-title">{item.title}</span>{#if item.duration}<span
								class="duration"
								data-testid="Timeline-block-duration">{item.duration} min</span
							>{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<ol class="timeline">
	{#each groups as group (group.id)}
		{#if group.name}
			{@const duration = timelineDuration(group.items)}
			{@const containsCurrent = group.items.some((item) => item.id === currentId)}
			<li
				class="item shared-block tone-{group.color ?? 'none'}"
				class:current={containsCurrent}
				class:passed={currentIndex > items.indexOf(group.items.at(-1)!)}
				data-testid="Timeline-block"
				data-current={containsCurrent ? '' : undefined}
			>
				<details>
					<summary data-testid="Timeline-block-toggle">
						<span class="time mono">
							{#if group.items[0].time}<span class="start">{group.items[0].time}</span>{/if}
						</span>
						<span class="body"
							><span class="row"
								><span class="dot" aria-hidden="true"></span><span class="title"
									><span class="title-text">{group.name}</span>{#if duration}<span
											class="duration"
											data-testid="Timeline-block-total">{duration} min</span
										>{/if}</span
								><svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
								></span
							></span
						>
					</summary>
					<div class="block-contents" data-testid="Timeline-block-contents">
						<div class="block-facts" data-testid="Timeline-block-facts">
							{#if timeRange(group.items[0].time, group.items.at(-1)!.end)}<span class="mono range"
									>{timeRange(group.items[0].time, group.items.at(-1)!.end)}</span
								>{/if}
							{#if group.categoryName}<span class="category"
									><span class="swatch" aria-hidden="true"></span><span class="name"
										>{group.categoryName}</span
									></span
								>{/if}
							<span class="actions">
								{#if editTemplate}<EditLink
										source={{ block: group.items[0].sharedBlock!.key, path: [] }}
										label={`Edit ${group.name}`}
									/>{/if}
								{#if calendarDate}<CalendarLink
										date={calendarDate}
										items={group.items}
										title={group.name}
									/>{/if}
							</span>
						</div>
						{@render contents(group.items)}
					</div>
				</details>
			</li>
		{:else}
			{@render row(group.items[0])}
		{/if}
		{#if gaps.has(group.id)}
			{@const gap = gaps.get(group.id)!}
			<li class="item timeline-gap" data-testid="Timeline-gap">
				<div class="time mono"><span class="start">{gap.time}</span></div>
				<div class="body">
					<div class="row">
						<span class="gap-dot" aria-hidden="true"></span><span>{gap.duration} min free</span>
					</div>
				</div>
			</li>
		{/if}
	{/each}
</ol>

<style>
	/* Free time stays on the rail but reads as quieter, shorter rows than activities. */
	.timeline-gap {
		--row-height: 32px;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.timeline-gap :global(.row) {
		padding: 0;
	}
	.timeline-gap :global(.time) {
		font-size: var(--text-xs);
	}
	.gap-dot {
		flex: none;
		width: var(--node);
		height: var(--node);
		border: 1px dashed var(--muted);
		border-radius: 50%;
		background: var(--bg);
	}
	.timeline-gap :global(.start) {
		color: var(--muted);
	}

	.shared-block > details {
		grid-column: 1 / -1;
		min-width: 0;
	}
	summary {
		display: grid;
		grid-template-columns: var(--time-col) minmax(0, 1fr);
		align-items: start;
		gap: var(--gap);
		cursor: pointer;
		list-style: none;
		border-radius: var(--radius);
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}
	.block-contents {
		margin: -0.8rem 0 0.25rem calc(var(--time-col) + var(--gap) + var(--node) + 0.75rem);
		--indent: 0px;
	}
	.contents-list {
		margin: 0;
		padding-left: 1rem;
		list-style: disc;
		color: var(--muted);
	}
	/* Each entry's bullet shows its own category, which may differ from the block's. */
	.contents-list li::marker {
		color: var(--tone);
		font-size: 1.3em;
	}
	.contents-list li {
		padding: 0;
		font-size: var(--text-sm);
		line-height: 1.35;
	}
	.contents-row {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.5rem;
	}
	button.contents-row {
		width: 100%;
		min-height: 28px;
		padding: 0;
		border-radius: 0;
		background: none;
		font-weight: inherit;
		text-align: left;
	}
	/* The open block's own time range, category and calendar link, above its activities. */
	.block-facts {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 32px;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.block-facts .range {
		color: var(--text);
	}
	.block-facts .range {
		flex: none;
	}
	.block-facts .category {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}
	.block-facts .name {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.block-facts .swatch {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--tone);
	}
	.block-facts .actions {
		display: flex;
		margin-left: auto;
	}
	.contents-title {
		min-width: 0;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	button.contents-row[aria-expanded='false'] .contents-title {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.block-contents :global(.details) {
		margin: -0.3rem 0 0.1rem;
	}
	.contents-row :global(.duration) {
		margin-left: 0;
	}
</style>
