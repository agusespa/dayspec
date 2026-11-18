<script lang="ts">
	import { untrack } from 'svelte';
	import type { ChoiceValue } from '#lib/routine/types.ts';
	import { isGroup, isUse, type Entry, type Routine, type Choice, type When } from '#lib/routine/types.ts';
	import { moveEntry, newEntry } from '#lib/routine/edit.ts';
	import EntryEditor from './EntryEditor.svelte';
	import ConditionsEditor from './ConditionsEditor.svelte';
	import BranchSection from './BranchSection.svelte';
	import {
		timelineSections,
		branchOptions,
		inBranch,
		newBranch,
		moveSection
	} from '#lib/routine/branches.ts';
	import { describeWhen } from '#lib/routine/outline.ts';
	let {
		entries = $bindable(),
		routine,
		shared = false,
		choices = {},
		focus,
		excluded = []
	}: {
		entries: Entry[];
		routine: Routine;
		shared?: boolean;
		choices?: Record<string, Choice>;
		/** Entry position to open and scroll to on arrival, e.g. from an item's edit link on Today. */
		focus?: number[];
		excluded?: string[];
	} = $props();
	const sections = $derived(timelineSections(entries, choices, excluded));
	let addChoice = $state('');
	let active = $state<number>();
	let conditionsOpen = $state<Record<number, boolean>>({});
	function addInside(indices: number[], key: string, value: ChoiceValue, use?: string) {
		const item: Entry = { ...(use ? { use } : newEntry()), ...(shared ? {} : { time: '08:00' }) };
		item.when = { [key]: value };
		const end = indices.at(-1)! + 1;
		entries = [...entries.slice(0, end), item, ...entries.slice(end)];
	}
	/**
	 * Opens an entry on the way to the focused one, once on arrival; the target is also scrolled to.
	 * Set on the element rather than as an `open` attribute, which would close entries the user opened.
	 */
	function reveal(node: HTMLDetailsElement, target: boolean) {
		node.open = true;
		if (target) requestAnimationFrame(() => node.scrollIntoView({ block: 'start' }));
	}
	/** A group is named by the conditions it shows under, e.g. "When Gym on · Mon, Tue". */
	function groupLabel(when: When | undefined): string {
		const conditions = describeWhen(when, choices);
		return conditions.length ? `When ${conditions.join(' · ')}` : 'Always';
	}
	function set(index: number, field: string, value: unknown) {
		const next = { ...entries[index], [field]: value } as Entry;
		if (value === '' || value === undefined) delete (next as unknown as Record<string, unknown>)[field];
		entries = entries.map((entry, i) => (i === index ? next : entry));
	}
</script>

{#snippet row(i: number, branch?: string)}
	{@const entry = entries[i]}
	{@const target = focus?.[0] === i}
	{@const focused = target || active === i}
	{#if branch && isGroup(entry) && Object.keys(entry.when ?? {}).length === 1}
		<EntryEditor
			bind:entries={entry.items}
			{routine}
			{shared}
			{choices}
			excluded={[...excluded, branch]}
			focus={target ? focus!.slice(1) : undefined}
		/>
	{:else}
		<details
			class="entry"
			data-testid="EntryEditor-entry"
			ontoggle={(event) => {
				if (event.currentTarget.open) active = i;
				else if (active === i) active = undefined;
			}}
			data-focused={focused && (!target || focus!.length === 1) ? '' : undefined}
			{@attach (node) => {
				if (focused) untrack(() => reveal(node, !target || focus!.length === 1));
			}}
		>
			<summary data-testid="EntryEditor-open"
				><span class="summary-index">{i + 1}</span><span class="summary-title"
					>{#if isGroup(entry)}{groupLabel(entry.when)}{:else if isUse(entry)}{routine.blocks?.[entry.use]
							?.name ?? entry.use}{:else}{entry.title || 'Untitled item'}{/if}</span
				>{#if !shared && !isGroup(entry) && entry.time}<span class="summary-time mono">{entry.time}</span
					>{/if}{#if isGroup(entry)}<span class="badge">Group</span>{:else if isUse(entry)}<span class="badge"
						>Shared</span
					>{/if}{#if entry.when && !isGroup(entry)}<span class="entry-condition"
						>{describeWhen(
							Object.fromEntries(Object.entries(entry.when).filter(([key]) => key !== branch)),
							choices
						).join(' · ')}</span
					>{/if}<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
				></summary
			>
			<div class="entry-body shared">
				{#if isGroup(entry)}
					<EntryEditor
						bind:entries={entry.items}
						{routine}
						{shared}
						{choices}
						excluded={branch ? [...excluded, branch] : excluded}
						focus={target ? focus!.slice(1) : undefined}
					/>
				{:else}
					{#if isUse(entry)}
						<label
							>Shared block<select
								data-testid="EntryEditor-block"
								value={entry.use}
								onchange={(e) => set(i, 'use', e.currentTarget.value)}
								>{#each Object.entries(routine.blocks ?? {}) as [id, block]}<option value={id}
										>{block.name}</option
									>{/each}</select
							></label
						>
					{:else}
						<label
							>Title<input
								data-testid="EntryEditor-title"
								value={entry.title}
								oninput={(e) => set(i, 'title', e.currentTarget.value)}
								required
							/></label
						>
					{/if}
					<div class="fields">
						{#if !shared}<label
								>Start time<input
									data-testid="EntryEditor-time"
									type="time"
									value={entry.time ?? ''}
									oninput={(e) => set(i, 'time', e.currentTarget.value)}
									required
								/></label
							>{/if}
						{#if !isUse(entry)}<label
								>Duration (minutes)<input
									data-testid="EntryEditor-duration"
									type="number"
									min="1"
									max="1440"
									step="1"
									value={entry.duration ?? ''}
									oninput={(e) =>
										set(
											i,
											'duration',
											e.currentTarget.value === '' ? undefined : e.currentTarget.valueAsNumber
										)}
									required
								/></label
							>{/if}
					</div>
					{#if !isUse(entry)}
						<label
							>Category<select
								data-testid="EntryEditor-category"
								value={entry.category ?? ''}
								onchange={(e) => set(i, 'category', e.currentTarget.value)}
								><option value="">{shared ? 'Same as block' : 'None'}</option
								>{#each Object.entries(routine.categories ?? {}) as [id, category] (id)}<option value={id}
										>{category.name}</option
									>{/each}</select
							></label
						>
						<label class="check"
							><input
								type="checkbox"
								checked={entry.alert ?? false}
								onchange={(e) => set(i, 'alert', e.currentTarget.checked || undefined)}
							/>Alert</label
						>
						{#if !shared}<label class="check"
								><input
									type="checkbox"
									checked={entry.approx ?? false}
									onchange={(e) => set(i, 'approx', e.currentTarget.checked || undefined)}
								/>Approximate time</label
							>{/if}
						<label
							>Note<textarea
								data-testid="EntryEditor-note"
								rows="2"
								value={entry.note ?? ''}
								oninput={(e) => set(i, 'note', e.currentTarget.value)}></textarea></label
						>
						<label
							>Links<textarea
								data-testid="EntryEditor-link"
								rows="2"
								placeholder="https://www.notion.so/…"
								value={Array.isArray(entry.link) ? entry.link.join('\n') : (entry.link ?? '')}
								oninput={(e) => {
									const urls = e.currentTarget.value
										.split('\n')
										.map((v) => v.trim())
										.filter(Boolean);
									set(i, 'link', urls.length > 1 ? urls : urls[0]);
								}}></textarea></label
						>
					{/if}
				{/if}
				<ConditionsEditor
					bind:when={entry.when}
					bind:open={() => conditionsOpen[i] ?? false, (value) => (conditionsOpen[i] = value)}
					{choices}
				/>
				<div class="entry-tools">
					<button
						type="button"
						data-testid="EntryEditor-up"
						aria-label={`Move item ${i + 1} up`}
						disabled={i === 0}
						onclick={() => (entries = moveEntry(entries, i, -1))}>↑</button
					>
					<button
						type="button"
						data-testid="EntryEditor-down"
						aria-label={`Move item ${i + 1} down`}
						disabled={i === entries.length - 1}
						onclick={() => (entries = moveEntry(entries, i, 1))}>↓</button
					>
					<button
						type="button"
						class="danger"
						data-testid="EntryEditor-remove"
						onclick={() => (entries = entries.filter((_, j) => j !== i))}>Remove item</button
					>
				</div>
			</div>
		</details>
	{/if}
{/snippet}

<div class="entries">
	{#if !entries.length && excluded.length}<p class="branch-empty">Continue routine</p>{/if}
	{#each sections as section (section.start)}
		{#if section.choice}
			{@const name = section.choice}
			{@const choice = choices[name]}
			{@const focusedIndex = active ?? focus?.[0]}
			{@const preferred =
				focusedIndex !== undefined && section.indices.includes(focusedIndex)
					? branchOptions(choice).find((o) => inBranch(entries[focusedIndex], name, o.value))?.value
					: undefined}
			<BranchSection {name} {choice} {preferred}>
				{#snippet children(value)}
					{#each section.indices.filter((i) => inBranch(entries[i], name, value)) as i (i)}
						{@render row(i, name)}
					{:else}<p class="branch-empty">Continue routine</p>{/each}
					<div
						class="entry-tools branch-add"
						class:branch-add-hidden={section.indices.some(
							(i) =>
								inBranch(entries[i], name, value) &&
								isGroup(entries[i]) &&
								Object.keys(entries[i].when ?? {}).length === 1
						)}
					>
						<button type="button" class="add" onclick={() => addInside(section.indices, name, value)}
							>+ Add activity</button
						>
						{#if Object.keys(routine.blocks ?? {}).length}<button
								type="button"
								class="add"
								onclick={() => addInside(section.indices, name, value, Object.keys(routine.blocks!)[0])}
								>+ Use shared block</button
							>{/if}
					</div>
				{/snippet}
			</BranchSection>
			<div class="entry-tools branch-tools">
				<button
					type="button"
					aria-label="Move branch up"
					disabled={sections[0] === section}
					onclick={() => (entries = moveSection(entries, sections, section.start, -1))}>↑</button
				>
				<button
					type="button"
					aria-label="Move branch down"
					disabled={sections.at(-1) === section}
					onclick={() => (entries = moveSection(entries, sections, section.start, 1))}>↓</button
				>
				<button
					type="button"
					class="danger"
					onclick={() => {
						if (confirm('Remove this branch and its activities?'))
							entries = entries.filter((_, i) => !section.indices.includes(i));
					}}>Remove section</button
				>
			</div>
		{:else}
			{#each section.indices as i (i)}{@render row(i)}{/each}
		{/if}
	{/each}
	<div class="entry-tools">
		<button
			type="button"
			class="add"
			data-testid="EntryEditor-add"
			onclick={() => (entries = [...entries, { ...newEntry(), ...(shared ? {} : { time: '08:00' }) }])}
			>+ Add item</button
		>
		{#if Object.keys(routine.blocks ?? {}).length}<button
				type="button"
				class="add"
				data-testid="EntryEditor-use"
				onclick={() =>
					(entries = [
						...entries,
						{ use: Object.keys(routine.blocks!)[0], ...(shared ? {} : { time: '08:00' }) }
					])}>+ Use shared block</button
			>{/if}
	</div>
	{#if !shared && Object.keys(choices).some((key) => !excluded.includes(key))}
		<div class="branch-create">
			<select aria-label="Alternative for new branch" bind:value={addChoice}>
				<option value="">Select an alternative…</option>
				{#each Object.entries(choices).filter(([key]) => !excluded.includes(key)) as [key, choice]}<option
						value={key}>{choice.label ?? key}</option
					>{/each}
			</select>
			<button
				type="button"
				class="add"
				disabled={!addChoice}
				onclick={() => {
					entries = [...entries, ...newBranch(addChoice, choices[addChoice])];
					addChoice = '';
				}}>+ Add branch</button
			>
		</div>
	{/if}
</div>
