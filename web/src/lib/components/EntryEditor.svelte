<script lang="ts">
	import { isGroup, isUse, type Entry, type Routine, type Choice, type When } from '#lib/routine/types.ts';
	import { moveEntry, newEntry } from '#lib/routine/edit.ts';
	import EntryEditor from './EntryEditor.svelte';
	import ConditionsEditor from './ConditionsEditor.svelte';
	import { describeWhen } from '#lib/routine/outline.ts';
	let {
		entries = $bindable(),
		routine,
		shared = false,
		choices = {}
	}: { entries: Entry[]; routine: Routine; shared?: boolean; choices?: Record<string, Choice> } = $props();
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

<div class="entries">
	{#each entries as entry, i}
		<details class="entry" data-testid="EntryEditor-entry">
			<summary data-testid="EntryEditor-open"
				><span class="summary-index">{i + 1}</span><span class="summary-title"
					>{#if isGroup(entry)}{groupLabel(entry.when)}{:else if isUse(entry)}{routine.blocks?.[entry.use]
							?.name ?? entry.use}{:else}{entry.title || 'Untitled item'}{/if}</span
				>{#if !shared && !isGroup(entry) && entry.time}<span class="summary-time mono">{entry.time}</span
					>{/if}{#if isGroup(entry)}<span class="badge">Group</span>{:else if isUse(entry)}<span class="badge"
						>Shared</span
					>{/if}<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
				></summary
			>
			<div class="entry-body shared">
				{#if isGroup(entry)}
					<EntryEditor bind:entries={entry.items} {routine} {shared} {choices} />
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
							/>Can’t be delayed</label
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
				<ConditionsEditor bind:when={entry.when} {choices} />
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
</div>
