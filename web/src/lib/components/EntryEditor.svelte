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
	import { blocksByName, moveEntry, newEntry, sortEntriesByTime } from '#lib/routine/edit.ts';
	import EntryEditor from './EntryEditor.svelte';
	import BranchSection from './BranchSection.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
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
				data-testid="EntryEditor-event"
				onclick={(event) => {
					event.currentTarget.closest('details')!.open = false;
					add();
				}}>Event</button
			>
			{#if Object.keys(routine.blocks ?? {}).length}
				<button
					type="button"
					data-testid="EntryEditor-use"
					onclick={(event) => {
						event.currentTarget.closest('details')!.open = false;
						const [use] = blocksByName(routine)[0];
						add(use);
					}}>Shared block</button
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
							'Untitled item'}{/if}</span
				>{#if !shared && ('time' in entry ? entry.time : undefined)}<span class="summary-time mono"
						>{'time' in entry ? entry.time : undefined}</span
					>{/if}{#if isUse(entry)}<span class="badge">Shared</span>{/if}<svg
					class="chevron"
					viewBox="0 0 24 24"
					aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
				><button
					type="button"
					class="entry-delete"
					data-testid="EntryEditor-remove"
					aria-label={`Delete ${isUse(entry) ? 'shared block' : 'event'} ${isUse(entry) ? (routine.blocks?.[entry.use]?.name ?? entry.use) : entry.title || 'Untitled item'}`}
					onclick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						entries = entries.filter((_, j) => j !== i);
						sortByTime();
					}}>{@render trash()}</button
				></summary
			>
			<div class="entry-body shared">
				{#if isUse(entry)}
					<label
						>Shared block<select
							data-testid="EntryEditor-block"
							value={entry.use}
							onchange={(e) => set(i, 'use', e.currentTarget.value)}
							>{#each blocksByName(routine) as [id, block]}<option value={id}>{block.name}</option
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
								value={'time' in entry ? entry.time : ''}
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
								checked={'approx' in entry ? (entry.approx ?? false) : false}
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
						>Link<input
							data-testid="EntryEditor-link"
							type="url"
							placeholder="https://www.notion.so/…"
							value={entry.link ?? ''}
							oninput={(e) => set(i, 'link', e.currentTarget.value.trim())}
						/></label
					>
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
