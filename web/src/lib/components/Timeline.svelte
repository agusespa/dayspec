<script lang="ts" generics="T extends ResolvedItem">
	import type { Snippet } from 'svelte';
	import type { ResolvedItem } from '#lib/routine/resolve.ts';
	import { groupTimeline, timelineEnd, timelineGaps } from '#lib/routine/timeline.ts';
	import { itemMeta } from './TimelineItem.svelte';
	let { items, row, currentId }: { items: T[]; row: Snippet<[T]>; currentId?: string } = $props();
	const currentIndex = $derived(items.findIndex((item) => item.id === currentId));
	const groups = $derived(groupTimeline(items));
	const gaps = $derived(timelineGaps(groups));
</script>

{#snippet contents(entries: ResolvedItem[])}
	<ul class="contents-list">
		{#each entries as item (item.id)}
			<li data-testid="Timeline-block-entry">
				<div class="contents-row">
					<span class="contents-title">{item.title}</span>{#if item.duration}<span
							class="contents-duration"
							data-testid="Timeline-block-duration">{item.duration} min</span
						>{/if}
				</div>
				{@render itemMeta({ ...item, duration: undefined })}
			</li>
		{/each}
	</ul>
{/snippet}

<ol class="timeline">
	{#each groups as group (group.id)}
		{#if group.name}
			{@const end = timelineEnd(group.items)}
			{@const duration = end === undefined ? undefined : end - group.items[0].sortKey}
			{@const containsCurrent = group.items.some((item) => item.id === currentId)}
			<li
				class="item shared-block kind-{group.items[0].kind ?? 'none'}"
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
								><span class="dot" aria-hidden="true"></span><span class="title">{group.name}</span><svg
									class="chevron"
									viewBox="0 0 24 24"
									aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
								>{#if duration}<span class="contents-duration" data-testid="Timeline-block-total"
										>{duration} min</span
									>{/if}</span
							></span
						>
					</summary>
					<div class="block-contents" data-testid="Timeline-block-contents">
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
						<span class="gap-dot" aria-hidden="true"></span><span>Unplanned</span><span
							class="contents-duration">{gap.duration} min</span
						>
					</div>
				</div>
			</li>
		{/if}
	{/each}
</ol>

<style>
	.timeline-gap {
		color: var(--muted);
		font-size: 0.85rem;
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
	.chevron {
		flex: none;
		width: 22px;
		height: 22px;
		margin-left: -0.35rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		color: var(--secondary);
		transition: transform 0.15s;
	}
	details[open] .chevron {
		transform: rotate(180deg);
	}
	.block-contents {
		margin: 0 0 0.75rem calc(var(--time-col) + var(--gap) + var(--node) + 0.75rem);
		--indent: 0px;
	}
	.contents-list {
		margin: 0;
		padding-left: 1rem;
		list-style: disc;
		color: var(--muted);
	}
	.contents-list li {
		padding: 0.3rem 0;
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.contents-row {
		display: flex;
		align-items: baseline;
		justify-content: flex-start;
		gap: 0.5rem;
	}
	.contents-duration {
		flex: none;
		color: var(--tertiary);
		font-size: 0.75rem;
	}
	.contents-title {
		color: var(--text);
	}
	.block-contents :global(.meta) {
		margin: 0.15rem 0 0;
		font-size: 0.75rem;
	}
</style>
