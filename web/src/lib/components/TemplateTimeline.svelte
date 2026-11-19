<script lang="ts">
	import type { Routine, Entry } from '#lib/routine/types.ts';
	import { outlineDay, weekdayLabel, type OutlineOption } from '#lib/routine/outline.ts';
	import { branchOptions } from '#lib/routine/branches.ts';
	import BranchSection from './BranchSection.svelte';
	import Timeline from './Timeline.svelte';
	import TimelineItem from './TimelineItem.svelte';
	let { routine, template }: { routine: Routine; template: string } = $props();
	const day = $derived(routine.days[template]);
	const choices = $derived(day.choices ?? {});
	const metadata = $derived(outlineDay(routine, template).choices);
	function optionNote(option: OutlineOption): string {
		const notes: string[] = [];
		if (option.defaultOn.length === day.on.length) notes.push('Default');
		else if (option.defaultOn.length) notes.push(`Default ${option.defaultOn.map(weekdayLabel).join(', ')}`);
		if (option.onlyOn) notes.push(`Available ${option.onlyOn.map(weekdayLabel).join(', ')}`);
		return notes.join(' · ');
	}
	function outline(entries: Entry[]) {
		return outlineDay({ ...routine, days: { [template]: { ...day, items: entries } } }, template).items;
	}
</script>

{#snippet items(entries: Entry[])}
	<Timeline items={outline(entries)}>
		{#snippet row(item)}<TimelineItem {item} />{/snippet}
	</Timeline>
{/snippet}

{#snippet flow(entries: Entry[])}
	{#each entries as entry, i}
		{#if 'paths' in entry}
			{@const name = entry.alternative}
			<BranchSection {name} choice={choices[name]}>
				{#snippet details(value)}
					{@const option = metadata.find((c) => c.name === name)?.options[
						branchOptions(choices[name]).findIndex((o) => o.value === value)
					]}
					{#if option && optionNote(option)}<p class="branch-details">{optionNote(option)}</p>{/if}
				{/snippet}
				{#snippet children(value)}
					{#if entry.paths[value]?.length}{@render flow(entry.paths[value])}{:else}<p class="branch-empty">
							Continue routine
						</p>{/if}
				{/snippet}
			</BranchSection>
		{:else if i === 0 || 'paths' in entries[i - 1]}
			{@const end = entries.findIndex((next, index) => index > i && 'paths' in next)}
			{@render items(entries.slice(i, end < 0 ? entries.length : end))}
		{/if}
	{/each}
{/snippet}

<div class="template-flow">{@render flow(day.items)}</div>
