<script lang="ts" generics="T extends ResolvedItem">
	import type { Snippet } from 'svelte';
	import type { ResolvedItem } from '#lib/routine/resolve.ts';
	import { groupTimeline, timelineDuration, timelineGaps } from '#lib/routine/timeline.ts';
	import CalendarLink from './CalendarLink.svelte';
	import AlertIcon from './AlertIcon.svelte';
	import EditLink from './EditLink.svelte';
	import ItemDetails, { timeRange } from './ItemDetails.svelte';
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
				<time class="contents-time mono" datetime={item.time} data-testid="Timeline-block-entry-start"
					>{item.time ? `${item.approx ? '≈' : ''}${item.time}` : ''}</time
				>
				<button
					type="button"
					class="contents-row"
					data-testid="Timeline-block-entry-toggle"
					aria-expanded={!!openEntries[item.id]}
					onclick={() => (openEntries[item.id] = !openEntries[item.id])}
					><span class="contents-dot" aria-hidden="true"></span><span class="contents-title"
						>{#if item.alert}<AlertIcon />{/if}{item.title}</span
					><svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button
				>
				{#if openEntries[item.id]}<ItemDetails {item} {calendarDate} {editTemplate} />{/if}
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
									>{#if group.items.some((item) => item.alert)}<AlertIcon />{/if}<span class="title-text"
										>{group.name}</span
									></span
								><svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
								></span
							></span
						>
					</summary>
					<div class="block-contents" data-testid="Timeline-block-contents">
						<div class="block-facts metadata-strip" data-testid="Timeline-block-facts">
							<div class="metadata">
								{#if duration}<span class="duration" data-testid="Timeline-block-total">{duration} min</span
									>{/if}
								{#if timeRange(group.items[0].time, group.items.at(-1)!.end)}<span class="mono range"
										>{timeRange(group.items[0].time, group.items.at(-1)!.end)}</span
									>{/if}
								{#if group.categoryName}<span class="category"
										><span class="swatch" aria-hidden="true"></span><span class="name"
											>{group.categoryName}</span
										></span
									>{/if}
							</div>
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
		margin: -0.8rem 0 0.25rem calc(var(--time-col) + var(--gap));
		--contents-time-col: 2.8rem;
		--contents-gap: 0.45rem;
		--contents-node: 6px;
		--contents-indent: calc(var(--contents-time-col) + var(--contents-gap) + var(--contents-node) + 0.5rem);
	}
	.contents-list {
		margin: 0;
		padding: 0 0 0 1rem;
		list-style: none;
		color: var(--muted);
	}
	.contents-list li {
		position: relative;
		display: grid;
		grid-template-columns: var(--contents-time-col) minmax(0, 1fr);
		column-gap: var(--contents-gap);
		padding: 0;
		font-size: var(--text-sm);
		line-height: 1.35;
	}
	/* A quieter rail connects the block's activities, including when their details are open. */
	.contents-list li::before {
		content: '';
		position: absolute;
		left: calc(var(--contents-time-col) + var(--contents-gap) + var(--contents-node) / 2 - 0.5px);
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--rule);
	}
	.contents-list li:first-child::before {
		top: 14px;
	}
	.contents-list li:last-child::before {
		bottom: calc(100% - 14px);
	}
	.contents-time {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		align-self: start;
		min-height: 28px;
		font-size: var(--text-xs);
		white-space: nowrap;
	}
	.contents-dot {
		position: relative;
		margin-top: 11px;
		flex: none;
		width: var(--contents-node);
		height: var(--contents-node);
		border-radius: 50%;
		background: var(--tone);
	}
	.contents-row {
		display: flex;
		align-items: flex-start;
		justify-content: flex-start;
		gap: 0.5rem;
		min-width: 0;
	}
	.contents-row .chevron {
		margin-top: 4px;
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
		margin: 0 0 0.35rem calc(var(--node) + 0.75rem);
	}
	.metadata {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.6rem;
		min-width: 0;
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
		max-width: 100%;
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
		flex: none;
	}
	.contents-title {
		padding: calc((28px - 1.35em) / 2) 0;
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
		grid-column: 1 / -1;
		margin: -0.15rem 0 0.2rem var(--contents-indent);
	}
</style>
