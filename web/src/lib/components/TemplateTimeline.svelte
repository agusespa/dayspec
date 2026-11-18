<script lang="ts">
	import type { Routine, Entry, ChoiceValue } from '#lib/routine/types.ts';
	import { outlineDay, weekdayLabel, type OutlineOption } from '#lib/routine/outline.ts';
	import { branchView, inBranch, branchOptions } from '#lib/routine/branches.ts';
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
	function outline(entries: Entry[], context: Record<string, ChoiceValue> = {}) {
		return outlineDay({ ...routine, days: { [template]: { ...day, items: entries } } }, template, context)
			.items;
	}
</script>

{#snippet items(entries: Entry[], context: Record<string, ChoiceValue> = {})}
	<Timeline items={outline(entries, context)}>
		{#snippet row(item)}
			<TimelineItem {item} showConditions={false}>
				{#if item.conditions.length}<div class="branch-conditions">{item.conditions.join(' · ')}</div>{/if}
			</TimelineItem>
		{/snippet}
	</Timeline>
{/snippet}

{#snippet flow(entries: Entry[], context: Record<string, ChoiceValue> = {})}
	{@const view = branchView(entries, choices, context)}
	{#each view.sections as section (section.start)}
		{#if section.choice}
			{@const name = section.choice}
			<BranchSection {name} choice={choices[name]}>
				{#snippet details(value)}
					{@const option = metadata.find((c) => c.name === name)?.options[
						branchOptions(choices[name]).findIndex((o) => o.value === value)
					]}
					{#if option && optionNote(option)}<p class="branch-details">{optionNote(option)}</p>{/if}
				{/snippet}
				{#snippet children(value)}
					{@const selected = section.indices
						.filter((i) => inBranch(view.entries[i], name, value))
						.map((i) => view.entries[i])}
					{#if selected.length && outline(selected).length}
						{@render flow(selected, { ...context, [name]: value })}
					{:else}<p class="branch-empty">Continue routine</p>{/if}
				{/snippet}
			</BranchSection>
		{:else}
			{@render items(
				section.indices.map((i) => view.entries[i]),
				context
			)}
		{/if}
	{/each}
{/snippet}

<div class="template-flow">{@render flow(day.items)}</div>

<style>
	.branch-conditions {
		margin: -0.2rem 0 0.5rem var(--indent);
		color: var(--tertiary);
		font-size: var(--text-2xs);
	}
</style>
