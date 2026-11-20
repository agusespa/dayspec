<script lang="ts">
	import { isUse, type Entry, type SharedEntry, type Branch, type Routine } from '#lib/routine/types.ts';
	import { blocksByName } from '#lib/routine/edit.ts';
	let {
		entry,
		routine,
		shared = false,
		form,
		onchange,
		onschedulechange
	}: {
		entry: Exclude<Entry | SharedEntry, Branch>;
		routine: Routine;
		shared?: boolean;
		form?: string;
		onchange: (field: string, value: unknown) => void;
		onschedulechange?: () => void;
	} = $props();
</script>

{#if isUse(entry)}
	<label
		>Shared block<select
			{form}
			data-testid="EntryEditor-block"
			value={entry.use}
			required
			onchange={(e) => onchange('use', e.currentTarget.value)}
			>{#if form}<option value="" disabled>Select a shared block…</option
				>{/if}{#each blocksByName(routine) as [id, block]}<option value={id}>{block.name}</option
				>{/each}</select
		></label
	>
{:else}
	<label
		>Title<input
			{form}
			data-testid="EntryEditor-title"
			value={entry.title}
			placeholder="Activity name"
			oninput={(e) => onchange('title', e.currentTarget.value)}
			required
		/></label
	>
{/if}
<div class="fields">
	{#if !shared}<label
			>Start time<input
				{form}
				data-testid="EntryEditor-time"
				type="time"
				value={'time' in entry ? entry.time : ''}
				oninput={(e) => onchange('time', e.currentTarget.value)}
				onblur={onschedulechange}
				required
			/></label
		>{/if}
	{#if !isUse(entry)}<label
			>Duration (minutes)<input
				{form}
				data-testid="EntryEditor-duration"
				type="number"
				min="1"
				max="1440"
				step="1"
				value={entry.duration ?? ''}
				oninput={(e) =>
					onchange('duration', e.currentTarget.value === '' ? undefined : e.currentTarget.valueAsNumber)}
				required
			/></label
		>{/if}
</div>
{#if !isUse(entry)}
	<label
		>Category<select
			{form}
			data-testid="EntryEditor-category"
			value={entry.category ?? ''}
			onchange={(e) => onchange('category', e.currentTarget.value)}
			><option value="">{shared ? 'Same as block' : 'None'}</option
			>{#each Object.entries(routine.categories ?? {}) as [id, category] (id)}<option value={id}
					>{category.name}</option
				>{/each}</select
		></label
	>
	<label class="check"
		><input
			{form}
			type="checkbox"
			checked={entry.alert ?? false}
			onchange={(e) => onchange('alert', e.currentTarget.checked || undefined)}
		/>Alert</label
	>
	{#if !shared}<label class="check"
			><input
				{form}
				type="checkbox"
				checked={'approx' in entry ? (entry.approx ?? false) : false}
				onchange={(e) => onchange('approx', e.currentTarget.checked || undefined)}
			/>Approximate time</label
		>{/if}
	<label
		>Note<textarea
			{form}
			data-testid="EntryEditor-note"
			rows="2"
			value={entry.note ?? ''}
			oninput={(e) => onchange('note', e.currentTarget.value)}></textarea></label
	>
	<label
		>Link<input
			{form}
			data-testid="EntryEditor-link"
			type="url"
			placeholder="https://www.notion.so/…"
			value={entry.link ?? ''}
			oninput={(e) => onchange('link', e.currentTarget.value.trim())}
		/></label
	>
{/if}
