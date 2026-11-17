<script lang="ts">
	import { isGroup, isUse, type Entry, type Routine, type Choice } from '#lib/routine/types.ts';
	import { moveEntry, newEntry } from '#lib/routine/edit.ts';
	import EntryEditor from './EntryEditor.svelte';
	import ConditionsEditor from './ConditionsEditor.svelte';
	let {
		entries = $bindable(),
		routine,
		shared = false,
		choices = {}
	}: { entries: Entry[]; routine: Routine; shared?: boolean; choices?: Record<string, Choice> } = $props();
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
				>{i + 1}. {isGroup(entry)
					? 'Conditional group'
					: isUse(entry)
						? `Shared · ${routine.blocks?.[entry.use]?.name ?? entry.use}`
						: entry.title || 'Untitled item'}</summary
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
								value={entry.kind ?? ''}
								onchange={(e) => set(i, 'kind', e.currentTarget.value)}
								><option value="">None</option
								>{#each ['maintenance', 'health', 'growth', 'alert', 'night'] as kind}<option value={kind}
										>{kind}</option
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
			data-testid="EntryEditor-add"
			onclick={() => (entries = [...entries, { ...newEntry(), ...(shared ? {} : { time: '08:00' }) }])}
			>+ Add item</button
		>
		{#if Object.keys(routine.blocks ?? {}).length}<button
				type="button"
				data-testid="EntryEditor-use"
				onclick={() =>
					(entries = [
						...entries,
						{ use: Object.keys(routine.blocks!)[0], ...(shared ? {} : { time: '08:00' }) }
					])}>+ Use shared block</button
			>{/if}
	</div>
</div>
