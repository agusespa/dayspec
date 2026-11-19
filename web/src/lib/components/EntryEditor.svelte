<script lang="ts">
	import { untrack } from 'svelte';
	import type { ChoiceValue } from '#lib/routine/types.ts';
	import { isBranch, isUse, type Entry, type Routine, type Choice, type When } from '#lib/routine/types.ts';
	import { moveEntry, newEntry, sortEntriesByTime } from '#lib/routine/edit.ts';
	import EntryEditor from './EntryEditor.svelte';
	import BranchSection from './BranchSection.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { timelineSections, branchOptions, inBranch, newBranch } from '#lib/routine/branches.ts';
	import { describeWhen } from '#lib/routine/outline.ts';
	let {
		entries = $bindable(),
		routine,
		shared = false,
		choices = {},
		focus,
		excluded = [],
		onschedulechange
	}: {
		entries: Entry[];
		routine: Routine;
		shared?: boolean;
		choices?: Record<string, Choice>;
		/** Entry position to open and scroll to on arrival, e.g. from an item's edit link on Today. */
		focus?: number[];
		excluded?: string[];
		onschedulechange?: () => void;
	} = $props();
	const sections = $derived(timelineSections(entries, choices, excluded));
	let addingBranch = $state(false);
	let deleteRequest = $state<{ label: string; indices: number[]; trigger: HTMLElement }>();
	let active = $state<number>();
	// Keep each card's DOM state attached to its entry when the timeline is reordered.
	const entryKeys = new WeakMap<Entry, number>();
	let nextEntryKey = 0;
	function entryKey(entry: Entry): number {
		if (!entryKeys.has(entry)) entryKeys.set(entry, nextEntryKey++);
		return entryKeys.get(entry)!;
	}
	function addInside(indices: number[], key: string, value: ChoiceValue, use?: string) {
		const item: Entry = { ...(use ? { use } : newEntry()), ...(shared ? {} : { time: '08:00' }) };
		const branch = { when: { [key]: value }, items: [item] };
		const end = indices.at(-1)! + 1;
		entries = [...entries.slice(0, end), branch, ...entries.slice(end)];
		sortByTime();
	}
	function sortByTime() {
		if (shared) return;
		const before = entries;
		const sorted = sortEntriesByTime(entries, routine.settings?.day_starts_at, choices, excluded);
		if (!sorted.every((entry, index) => entry === before[index])) {
			if (active !== undefined) active = sorted.indexOf(before[active]);
			if (focus?.length) focus = [sorted.indexOf(before[focus[0]]), ...focus.slice(1)];
			entries = sorted;
		}
		onschedulechange?.();
	}
	function add(use?: string) {
		entries = [...entries, { ...(use ? { use } : newEntry()), ...(shared ? {} : { time: '08:00' }) }];
		sortByTime();
	}

	function dismissAddMenu(node: HTMLDetailsElement) {
		const outside = (event: MouseEvent) => {
			if (node.open && !event.composedPath().includes(node)) node.open = false;
		};
		const escape = (event: KeyboardEvent) => {
			if (!node.open || event.key !== 'Escape') return;
			node.open = false;
			node.querySelector('summary')?.focus();
			event.preventDefault();
		};
		document.addEventListener('click', outside, true);
		document.addEventListener('keydown', escape);
		return () => {
			document.removeEventListener('click', outside, true);
			document.removeEventListener('keydown', escape);
		};
	}

	/**
	 * Opens an entry on the way to the focused one, once on arrival; the target is also scrolled to.
	 * Set on the element rather than as an `open` attribute, which would close entries the user opened.
	 */
	function reveal(node: HTMLDetailsElement, target: boolean) {
		node.open = true;
		if (target) requestAnimationFrame(() => node.scrollIntoView({ block: 'start' }));
	}
	/** A branch is named by the conditions it shows under, e.g. "When Gym on · Mon, Tue". */
	function branchLabel(when: When | undefined): string {
		const conditions = describeWhen(when, choices);
		return conditions.length ? `When ${conditions.join(' · ')}` : 'Always';
	}
	function set(index: number, field: string, value: unknown) {
		const identity = entryKey(entries[index]);
		const next = { ...entries[index], [field]: value } as Entry;
		if (value === '' || value === undefined) delete (next as unknown as Record<string, unknown>)[field];
		entries = entries.map((entry, i) => (i === index ? next : entry));
		entryKeys.set(entries[index], identity);
	}
</script>

{#snippet trash()}
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg
	>
{/snippet}

{#snippet addItem(indices?: number[], key?: string, value?: ChoiceValue)}
	<details class="add-item" {@attach dismissAddMenu}>
		<summary class="add" data-testid="EntryEditor-add">+ Add item</summary>
		<div class="add-item-menu">
			<button
				type="button"
				data-testid="EntryEditor-event"
				onclick={(event) => {
					event.currentTarget.closest('details')!.open = false;
					if (indices && key && value !== undefined) addInside(indices, key, value);
					else add();
				}}>Event</button
			>
			{#if Object.keys(routine.blocks ?? {}).length}
				<button
					type="button"
					data-testid="EntryEditor-use"
					onclick={(event) => {
						event.currentTarget.closest('details')!.open = false;
						const use = Object.keys(routine.blocks!)[0];
						if (indices && key && value !== undefined) addInside(indices, key, value, use);
						else add(use);
					}}>Shared block</button
				>
			{/if}
		</div>
	</details>
{/snippet}

{#snippet row(i: number, branch?: string)}
	{@const entry = entries[i]}
	{@const target = focus?.[0] === i}
	{@const focused = target || active === i}
	{#if branch && isBranch(entry) && Object.keys(entry.when).length === 1}
		<EntryEditor
			bind:entries={entry.items}
			{routine}
			{shared}
			{choices}
			onschedulechange={() => {
				active = i;
				sortByTime();
			}}
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
					>{#if isBranch(entry)}{branchLabel(entry.when)}{:else if isUse(entry)}{routine.blocks?.[entry.use]
							?.name ?? entry.use}{:else}{entry.title || 'Untitled item'}{/if}</span
				>{#if !shared && !isBranch(entry) && entry.time}<span class="summary-time mono">{entry.time}</span
					>{/if}{#if isBranch(entry)}<span class="badge">Branch</span>{:else if isUse(entry)}<span
						class="badge">Shared</span
					>{/if}<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
				><button
					type="button"
					class="entry-delete"
					data-testid="EntryEditor-remove"
					aria-label={`Delete ${isBranch(entry) ? 'branch' : isUse(entry) ? 'shared block' : 'event'} ${isBranch(entry) ? branchLabel(entry.when) : isUse(entry) ? (routine.blocks?.[entry.use]?.name ?? entry.use) : entry.title || 'Untitled item'}`}
					onclick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						entries = entries.filter((_, j) => j !== i);
						sortByTime();
					}}>{@render trash()}</button
				></summary
			>
			<div class="entry-body shared">
				{#if isBranch(entry)}
					<EntryEditor
						bind:entries={entry.items}
						{routine}
						{shared}
						{choices}
						onschedulechange={() => {
							active = i;
							sortByTime();
						}}
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
									onblur={sortByTime}
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
				{#if shared}
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
					</div>
				{/if}
			</div>
		</details>
	{/if}
{/snippet}

{#if deleteRequest}
	<ConfirmDialog
		title="Delete branch?"
		message={`“${deleteRequest.label}” and all activities in its alternatives will be removed from this template.`}
		returnFocus={deleteRequest.trigger}
		oncancel={() => (deleteRequest = undefined)}
		onconfirm={() => {
			if (!deleteRequest) return;
			const { indices } = deleteRequest;
			deleteRequest = undefined;
			entries = entries.filter((_, i) => !indices.includes(i));
			sortByTime();
		}}
	/>
{/if}
<div class="entries">
	{#if !entries.length && excluded.length}<p class="branch-empty">Continue routine</p>{/if}
	{#each sections as section (Math.min(...section.indices.map((i) => entryKey(entries[i]))))}
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
					{#each section.indices.filter((i) => inBranch(entries[i], name, value)) as i (entryKey(entries[i]))}
						{@render row(i, name)}
					{:else}<p class="branch-empty">Continue routine</p>{/each}
					{#if !section.indices.some((i) => inBranch(entries[i], name, value) && isBranch(entries[i]) && Object.keys(entries[i].when).length === 1)}
						<div class="entry-tools branch-add">{@render addItem(section.indices, name, value)}</div>
					{/if}
				{/snippet}
				{#snippet actions()}
					<button
						type="button"
						class="entry-delete"
						aria-label={`Delete branch ${choice.label ?? name}`}
						onclick={(event) =>
							(deleteRequest = {
								label: choice.label ?? name,
								indices: section.indices,
								trigger: event.currentTarget
							})}>{@render trash()}</button
					>
				{/snippet}
			</BranchSection>
		{:else}
			{#each section.indices as i (entryKey(entries[i]))}{@render row(i)}{/each}
		{/if}
	{/each}
	<div class="entry-tools entry-add-controls">
		{@render addItem()}
		{#if !shared && Object.keys(choices).some((key) => !excluded.includes(key))}
			<button type="button" class="add" disabled={addingBranch} onclick={() => (addingBranch = true)}
				>+ Add branch</button
			>
		{/if}
	</div>
	{#if addingBranch}
		<section class="branch-draft" aria-label="New branch">
			<header>
				<span>New branch</span><button
					type="button"
					class="entry-delete"
					aria-label="Delete new branch"
					onclick={() => (addingBranch = false)}>{@render trash()}</button
				>
			</header>
			<label
				>Alternative<select
					aria-label="Alternative for new branch"
					{@attach (node) => node.focus()}
					onchange={(event) => {
						const key = event.currentTarget.value;
						if (!key) return;
						entries = [...entries, ...newBranch(key, choices[key])];
						addingBranch = false;
					}}
				>
					<option value="">Select an alternative…</option>
					{#each Object.entries(choices).filter(([key]) => !excluded.includes(key)) as [key, choice]}<option
							value={key}>{choice.label ?? key}</option
						>{/each}
				</select></label
			>
		</section>
	{/if}
</div>
