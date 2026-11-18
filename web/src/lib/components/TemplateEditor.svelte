<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { untrack } from 'svelte';
	import schema from '../../../../routine.schema.json';
	import { routineState, loadRoutine, saveRoutine, currentRoutine } from '#lib/routine/client.ts';
	import {
		cloneRoutine,
		createTemplate,
		assignTemplateDays,
		templateName,
		availableDays,
		removeTemplate,
		createBlock,
		removeBlock,
		blockReferences,
		renameBlock
	} from '#lib/routine/edit.ts';
	import { validateRoutine } from '#lib/routine/validate.ts';
	import { WEEKDAYS, type Routine, type Entry, type Weekday } from '#lib/routine/types.ts';
	import { weekdayLabel } from '#lib/routine/outline.ts';
	import EntryEditor from './EntryEditor.svelte';
	import ChoiceEditor from './ChoiceEditor.svelte';

	let {
		routine,
		templateKey,
		startCreating = false,
		manageBlocks = false,
		onclose
	}: {
		routine: Routine;
		templateKey: string;
		startCreating?: boolean;
		manageBlocks?: boolean;
		onclose: (key: string, saved: boolean) => void;
	} = $props();
	let draft = $state(cloneRoutine(untrack(() => routine)));
	let key = $state(untrack(() => templateKey));
	let revision = $state(untrack(() => $routineState.revision));
	let baseline = $state(untrack(() => JSON.stringify(draft)));
	let blockKey = $state('');
	let pendingBlock = $state('');
	let errors = $state<string[]>([]);
	let saving = $state(false);
	let creating = $state(untrack(() => startCreating));
	let newDays = $state<Weekday[]>([]);
	let blockName = $state('');
	const references = $derived(blockKey ? blockReferences(draft, blockKey) : []);
	function addBlock() {
		const name = 'New shared block';
		const created = createBlock($state.snapshot(draft), name);
		draft = created.routine;
		blockKey = created.key;
		pendingBlock = created.key;
		blockName = '';
		errors = [];
	}

	function deleteBlock() {
		if (!confirm('Delete this shared block and its items?')) return;
		try {
			draft = removeBlock($state.snapshot(draft), blockKey);
			blockKey = '';
			pendingBlock = '';
			errors = [];
		} catch (error) {
			errors = [(error as Error).message];
		}
	}

	function addTemplate() {
		try {
			const created = createTemplate($state.snapshot(draft), newDays);
			draft = created.routine;
			key = created.key;
			creating = false;
			newDays = [];
			errors = [];
		} catch (error) {
			errors = [(error as Error).message];
		}
	}
	function changeDay(day: Weekday, checked: boolean) {
		try {
			const days = checked ? [...draft.days[key].on, day] : draft.days[key].on.filter((d) => d !== day);
			draft = assignTemplateDays($state.snapshot(draft), key, days);
			errors = [];
		} catch (error) {
			errors = [(error as Error).message];
		}
	}

	const nameChanged = $derived(!!blockKey && !pendingBlock && blockName !== draft.blocks?.[blockKey]?.name);
	const dirty = $derived(JSON.stringify(draft) !== baseline || nameChanged);

	const changedElsewhere = $derived(!!$routineState.revision && $routineState.revision !== revision);

	beforeNavigate((navigation) => {
		if (dirty && !confirm('Discard your unsaved template changes?')) navigation.cancel();
	});
	function unload(event: BeforeUnloadEvent) {
		if (dirty) {
			event.preventDefault();
			event.returnValue = '';
		}
	}
	function cancel() {
		if (dirty && !confirm('Discard your unsaved template changes?')) return;
		baseline = JSON.stringify(draft);
		blockName = draft.blocks?.[blockKey]?.name ?? '';
		onclose(key, false);
	}
	async function remove() {
		if (!confirm('Delete this template and its items? Its days will become available for a new template.'))
			return;
		saving = true;
		try {
			await saveRoutine(removeTemplate($state.snapshot(draft), key), revision);
			baseline = JSON.stringify(draft);
			onclose('', true);
		} catch (error) {
			errors = [(error as Error).message];
		} finally {
			saving = false;
		}
	}
	async function save() {
		let candidate = $state.snapshot(draft);
		if (manageBlocks && blockKey) {
			try {
				candidate = renameBlock(candidate, blockKey, blockName);
			} catch (error) {
				errors = [(error as Error).message];
				return;
			}
		}
		errors = validateRoutine(candidate, schema);
		if (errors.length) return;
		saving = true;
		try {
			await saveRoutine(candidate, revision);
			baseline = JSON.stringify(draft);
			blockName = draft.blocks?.[blockKey]?.name ?? '';
			onclose(key, true);
		} catch (error) {
			errors = [
				error instanceof Error ? error.message : 'Could not save. Your draft is still open; try again.'
			];
		} finally {
			saving = false;
		}
	}
	async function reload() {
		if (dirty && !confirm('Discard your draft and load the latest saved templates?')) return;
		await loadRoutine();
		if (!$routineState.online) return;
		const latest = currentRoutine();
		draft = cloneRoutine(latest.routine);
		revision = latest.revision;
		baseline = JSON.stringify(draft);
		if (!draft.days[key]) key = Object.keys(draft.days)[0];
		blockKey = '';
		pendingBlock = '';
		blockName = '';
		errors = [];
	}
</script>

<svelte:window onbeforeunload={unload} />
<section class="template-editor" data-testid="TemplateEditor">
	<div class="editor-heading">
		<div>
			<p class="eyebrow">Routine library</p>
			<h1>
				{manageBlocks
					? pendingBlock
						? 'New shared block'
						: blockKey
							? 'Edit shared block'
							: 'Shared blocks'
					: creating
						? 'New template'
						: 'Edit template'}
			</h1>
			{#if !manageBlocks && !creating}<p class="help" data-testid="TemplateEditor-name">
					{templateName(draft.days[key].on)}
				</p>{/if}
		</div>
		{#if saving || dirty}<span class="save-state" role="status">{saving ? 'Saving…' : 'Unsaved changes'}</span
			>{/if}
	</div>

	<form
		novalidate
		onsubmit={(event) => {
			event.preventDefault();
			void save();
		}}
	>
		<fieldset disabled={saving}>
			{#if !manageBlocks}
				{#if creating}
					<section class="new-template" data-testid="TemplateEditor-create">
						<h2>{templateName(newDays)}</h2>

						<div class="day-pills">
							{#each WEEKDAYS as weekday}
								<label class="day-pill"
									><input
										type="checkbox"
										data-testid={`TemplateEditor-new-${weekday}`}
										disabled={!availableDays(draft).includes(weekday)}
										bind:group={newDays}
										value={weekday}
									/>{weekdayLabel(weekday)}</label
								>
							{/each}
						</div>
						<button
							type="button"
							class="primary create-confirm"
							data-testid="TemplateEditor-create-confirm"
							disabled={!newDays.length}
							onclick={addTemplate}>Create template</button
						>
					</section>
				{/if}
				{#if !creating}
					<label
						>Theme<input
							data-testid="TemplateEditor-theme"
							value={draft.days[key].theme ?? ''}
							placeholder="e.g. Deep work + family time"
							oninput={(e) => {
								const value = e.currentTarget.value;
								if (value) draft.days[key].theme = value;
								else delete draft.days[key].theme;
							}}
						/></label
					>
					<span class="field-label">Applies on</span>
					<div class="day-pills">
						{#each WEEKDAYS as weekday}<label class="day-pill"
								><input
									type="checkbox"
									checked={draft.days[key].on.includes(weekday)}
									data-testid={`TemplateEditor-day-${weekday}`}
									disabled={!availableDays(draft, key).includes(weekday)}
									onchange={(e) => {
										changeDay(weekday, e.currentTarget.checked);
										e.currentTarget.checked = draft.days[key].on.includes(weekday);
									}}
								/>{weekdayLabel(weekday)}</label
							>{/each}
					</div>

					<ChoiceEditor bind:routine={draft} template={key} />
					<h2>Timeline</h2>
					<EntryEditor
						bind:entries={draft.days[key].items}
						routine={draft}
						choices={draft.days[key].choices ?? {}}
					/>
				{/if}
			{:else}
				{#if blockKey && draft.blocks}
					<label class="block-name-field"
						>Name<input
							data-testid="TemplateEditor-block-name"
							bind:value={blockName}
							placeholder="e.g. Morning routine"
						/></label
					>
					<h2 class="block-items-heading">Activities</h2>
					{#key blockKey}
						<EntryEditor
							routine={draft}
							shared
							bind:entries={draft.blocks[blockKey].items}
							choices={Object.assign({}, ...Object.values(draft.days).map((day) => day.choices ?? {}))}
						/>
					{/key}
					{#if !pendingBlock}
						<div class="danger-zone">
							<button
								type="button"
								class="danger"
								data-testid="TemplateEditor-block-delete"
								disabled={references.length > 0}
								onclick={deleteBlock}>Delete block</button
							>
							{#if references.length}<p class="help" data-testid="TemplateEditor-block-references">
									Used by {references.join(', ')}. Remove those references before deleting this block.
								</p>{/if}
						</div>
					{/if}
				{:else}
					<div class="block-list" data-testid="TemplateEditor-block-list">
						{#each Object.entries(draft.blocks ?? {}) as [name, block]}
							<button
								type="button"
								class="block-list-row"
								data-testid={`TemplateEditor-block-${name}`}
								onclick={() => {
									blockKey = name;
									blockName = block.name;
									errors = [];
								}}
							>
								<span>{block.name}</span><span class="help"
									>{block.items.length}
									{block.items.length !== 1 ? 'items' : 'item'} · Edit →</span
								>
							</button>
						{:else}<p class="help">No shared blocks yet.</p>{/each}
					</div>
					<button type="button" class="add" data-testid="TemplateEditor-block-new" onclick={addBlock}
						>+ New shared block</button
					>
				{/if}
			{/if}
			{#if changedElsewhere}
				<p class="help" role="status" data-testid="TemplateEditor-remote-change">
					Templates changed on another device. Your draft is kept. Reload saved templates to use the latest
					version.
				</p>
			{/if}
			{#if errors.length}
				<div class="editor-errors" role="alert" data-testid="TemplateEditor-errors">
					<strong>Changes haven’t been saved</strong>
					<ul>
						{#each errors as error}<li>{error}</li>{/each}
					</ul>
				</div>
			{/if}
			{#if errors.length || changedElsewhere}<button
					data-testid="TemplateEditor-reload"
					type="button"
					onclick={reload}>Reload saved templates</button
				>{/if}
			{#if !creating && !manageBlocks && draft.days[key]}
				<div class="danger-zone">
					<button type="button" class="danger" data-testid="TemplateEditor-delete" onclick={remove}
						>Delete template</button
					>
					<p class="help">Its items are removed and its days become free for another template.</p>
				</div>
			{/if}
			<div class="editor-actions">
				<button data-testid="TemplateEditor-cancel" type="button" onclick={cancel}>Cancel</button>
				<button data-testid="TemplateEditor-save" class="primary" type="submit" disabled={!dirty}
					>{saving ? 'Saving…' : 'Save changes'}</button
				>
			</div>
		</fieldset>
	</form>
</section>
