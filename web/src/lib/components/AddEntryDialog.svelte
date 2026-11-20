<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { newEntry } from '#lib/routine/edit.ts';
	import { isUse, type Entry, type SharedEntry, type Branch, type Routine } from '#lib/routine/types.ts';
	import Dialog from './Dialog.svelte';
	import EntryFields from './EntryFields.svelte';
	let {
		routine,
		shared,
		kind,
		returnFocus,
		oncancel,
		onadd
	}: {
		routine: Routine;
		shared: boolean;
		kind: 'activity' | 'block';
		returnFocus: HTMLElement;
		oncancel: () => void;
		onadd: (entry: Entry | SharedEntry) => void;
	} = $props();
	let draft = $state<Exclude<Entry | SharedEntry, Branch>>(
		untrack(() => ({
			...(kind === 'block' ? { use: '' } : { ...newEntry(), title: '' }),
			...(shared ? {} : { time: '' })
		}))
	);
	let fields: HTMLDivElement;
	// Detach these inputs from the surrounding editor form: Enter must add only this draft.
	const id = $props.id();
	const form = `${id}-draft`;
	function change(field: string, value: unknown) {
		const next = { ...draft, [field]: value };
		if (value === '' || value === undefined) delete (next as Record<string, unknown>)[field];
		draft = next;
	}
	async function add() {
		if (!isUse(draft)) draft.title = draft.title?.trim() ?? '';
		await tick();
		const invalid = Array.from(
			fields.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
				'input, select, textarea'
			)
		).find((field) => !field.checkValidity());
		if (invalid) {
			invalid.reportValidity();
			return;
		}
		onadd($state.snapshot(draft));
	}
</script>

<Dialog
	title={kind === 'block' ? 'Add shared block' : 'Add activity'}
	width="480px"
	{returnFocus}
	{oncancel}
	onkeydown={(event) => {
		if (
			event.key === 'Enter' &&
			!event.isComposing &&
			event.target instanceof HTMLInputElement &&
			!['checkbox', 'button', 'submit'].includes(event.target.type)
		) {
			event.preventDefault();
			void add();
		}
	}}
>
	<div bind:this={fields} class="draft-fields">
		<EntryFields entry={draft} {routine} {shared} {form} onchange={change} />
	</div>
	{#snippet actions()}
		<button type="button" class="cancel" onclick={oncancel}>Cancel</button>
		<button type="button" class="primary" onclick={() => void add()}
			>{kind === 'block' ? 'Add shared block' : 'Add activity'}</button
		>
	{/snippet}
</Dialog>

<style>
	.draft-fields {
		padding-top: 0.25rem;
	}
	.cancel {
		border: 1px solid var(--rule);
		background: var(--inset);
	}
</style>
