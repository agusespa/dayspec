<script lang="ts">
	import { untrack } from 'svelte';
	import {
		isBranch,
		isUse,
		type Entry,
		type Routine,
		type Choice,
		type SharedEntry
	} from '#lib/routine/types.ts';
	import { moveEntry, sortEntriesByTime } from '#lib/routine/edit.ts';
	import EntryEditor from './EntryEditor.svelte';
	import BranchSection from './BranchSection.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import EntryFields from './EntryFields.svelte';
	import AddEntryDialog from './AddEntryDialog.svelte';
	import { branchOptions, newBranch } from '#lib/routine/branches.ts';
	let {
		entries = $bindable(),
		routine,
		shared = false,
		choices = {},
		focus,
		ancestors = [],
		onschedulechange
	}: {
		entries: (Entry | SharedEntry)[];
		routine: Routine;
		shared?: boolean;
		choices?: Record<string, Choice>;
		/** Entry position to open and scroll to on arrival, e.g. from an item's edit link on Today. */
		focus?: number[];
		ancestors?: string[];
		onschedulechange?: () => void;
	} = $props();
	let addingBranch = $state(false);
	let addRequest = $state<{ kind: 'activity' | 'block'; trigger: HTMLElement }>();
	let deleteRequest = $state<{ label: string; indices: number[]; trigger: HTMLElement }>();
	let active = $state<number>();
	// Keep each card's DOM state attached to its entry when the timeline is reordered.
	const entryKeys = new WeakMap<Entry | SharedEntry, number>();
	let nextEntryKey = 0;
	function entryKey(entry: Entry | SharedEntry): number {
		if (!entryKeys.has(entry)) entryKeys.set(entry, nextEntryKey++);
		return entryKeys.get(entry)!;
	}

	function sortByTime() {
		if (shared) return;
		const before = entries as Entry[];
		const sorted = sortEntriesByTime(before, routine.settings?.day_starts_at);
		if (!sorted.every((entry, index) => entry === before[index])) {
			if (active !== undefined) active = sorted.indexOf(before[active]);
			if (focus?.length) focus = [sorted.indexOf(before[focus[0]]), ...focus.slice(1)];
			entries = sorted;
		}
		onschedulechange?.();
	}
	function requestAdd(kind: 'activity' | 'block', trigger: HTMLButtonElement) {
		const menu = trigger.closest('details')!;
		menu.open = false;
		addRequest = { kind, trigger: menu.querySelector('summary')! };
	}
	function add(entry: Entry | SharedEntry) {
		entries = [...entries, entry];
		active = entries.length - 1;
		sortByTime();
		addRequest = undefined;
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

{#snippet addItem()}
	<details class="add-item" {@attach dismissAddMenu}>
		<summary class="add" data-testid="EntryEditor-add">+ Add item</summary>
		<div class="add-item-menu">
			<button
				type="button"
				data-testid="EntryEditor-activity"
				onclick={(event) => requestAdd('activity', event.currentTarget)}>Activity</button
			>
			{#if Object.keys(routine.blocks ?? {}).length}
				<button
					type="button"
					data-testid="EntryEditor-use"
					onclick={(event) => requestAdd('block', event.currentTarget)}>Routine</button
				>
			{/if}
		</div>
	</details>
{/snippet}

{#snippet row(i: number)}
	{@const entry = entries[i]}
	{@const target = focus?.[0] === i}
	{@const focused = target || active === i}
	{#if !isBranch(entry)}
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
					>{#if isUse(entry)}{routine.blocks?.[entry.use]?.name ?? entry.use}{:else}{entry.title ||
							'Untitled activity'}{/if}</span
				>{#if !shared && ('time' in entry ? entry.time : undefined)}<span class="summary-time mono"
						>{'time' in entry ? entry.time : undefined}</span
					>{/if}{#if isUse(entry)}<span class="badge">Routine</span>{/if}<svg
					class="chevron"
					viewBox="0 0 24 24"
					aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
				><button
					type="button"
					class="entry-delete"
					data-testid="EntryEditor-remove"
					aria-label={`Delete ${isUse(entry) ? 'routine' : 'activity'} ${isUse(entry) ? (routine.blocks?.[entry.use]?.name ?? entry.use) : entry.title || 'Untitled activity'}`}
					onclick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						entries = entries.filter((_, j) => j !== i);
						sortByTime();
					}}>{@render trash()}</button
				></summary
			>
			<div class="entry-body shared">
				<EntryFields
					{entry}
					{routine}
					{shared}
					onchange={(field, value) => set(i, field, value)}
					onschedulechange={sortByTime}
				/>
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

{#if addRequest}
	<AddEntryDialog
		{routine}
		{shared}
		kind={addRequest.kind}
		returnFocus={addRequest.trigger}
		oncancel={() => (addRequest = undefined)}
		onadd={add}
	/>
{/if}
{#if deleteRequest}
	<ConfirmDialog
		title="Delete branch?"
		message={`“${deleteRequest.label}” and all activities in its paths will be removed from this template.`}
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
	{#if !entries.length && ancestors.length}<p class="branch-empty">Continue routine</p>{/if}
	{#each entries as entry, i (entryKey(entry))}
		{#if isBranch(entry)}
			{@const name = entry.choice}
			{@const choice = choices[name]}
			{@const target = focus?.[0] === i}
			<BranchSection {name} {choice} preferred={target ? Object.keys(choice.options)[focus![1]] : undefined}>
				{#snippet children(value)}
					<EntryEditor
						bind:entries={() => entry.paths[value] ?? [], (items) => (entry.paths[value] = items as Entry[])}
						{routine}
						{choices}
						ancestors={[...ancestors, name]}
						onschedulechange={() => {
							active = i;
							sortByTime();
						}}
						focus={target && Object.keys(choice.options)[focus![1]] === value ? focus!.slice(2) : undefined}
					/>
				{/snippet}
				{#snippet actions()}
					<button
						type="button"
						class="entry-delete"
						aria-label={`Delete branch ${choice.label ?? name}`}
						onclick={(event) =>
							(deleteRequest = { label: choice.label ?? name, indices: [i], trigger: event.currentTarget })}
						>{@render trash()}</button
					>
				{/snippet}
			</BranchSection>
		{:else}
			{@render row(i)}
		{/if}
	{/each}
	<div class="entry-tools entry-add-controls">
		{@render addItem()}
		{#if !shared && Object.keys(choices).some((key) => !ancestors.includes(key))}
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
				>Choice<select
					aria-label="Choice for new branch"
					{@attach (node) => node.focus()}
					onchange={(event) => {
						const key = event.currentTarget.value;
						if (!key) return;
						entries = [...entries, newBranch(key, choices[key])];
						sortByTime();
						addingBranch = false;
					}}
				>
					<option value="">Select a choice…</option>
					{#each Object.entries(choices).filter(([key]) => !ancestors.includes(key)) as [key, choice]}<option
							value={key}>{choice.label ?? key}</option
						>{/each}
				</select></label
			>
		</section>
	{/if}
</div>
