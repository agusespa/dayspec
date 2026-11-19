<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import schema from '../../../../routine.schema.json';
	import { routineState, loadRoutine, saveRoutine, currentRoutine } from '#lib/routine/client.ts';
	import {
		cloneRoutine,
		createTemplate,
		assignTemplateDays,
		templateName,
		availableDays,
		createBlock,
		removeBlock,
		blockReferences,
		renameBlock
	} from '#lib/routine/edit.ts';
	import { validateRoutine } from '#lib/routine/validate.ts';
	import { WEEKDAYS, type Routine, type SharedEntry, type Weekday } from '#lib/routine/types.ts';
	import { weekdayLabel } from '#lib/routine/outline.ts';
	import EntryEditor from './EntryEditor.svelte';
	import ChoiceEditor from './ChoiceEditor.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	let {
		routine,
		templateKey,
		startCreating = false,
		manageBlocks = false,
		startBlock = '',
		focus,
		onclose
	}: {
		routine: Routine;
		templateKey: string;
		startCreating?: boolean;
		manageBlocks?: boolean;
		/** Opens this shared block straight away (with `manageBlocks`). */
		startBlock?: string;
		/** Entry position to open and scroll to, in the template or in `startBlock`. */
		focus?: number[];
		onclose: (key: string, saved: boolean) => void;
	} = $props();
	let draft = $state(cloneRoutine(untrack(() => routine)));
	let key = $state(untrack(() => templateKey));
	let revision = $state(untrack(() => $routineState.revision));
	let baseline = $state(untrack(() => JSON.stringify(draft)));
	let blockKey = $state(untrack(() => (startBlock && routine.blocks?.[startBlock] ? startBlock : '')));
	let pendingBlock = $state('');
	let errors = $state<string[]>([]);
	let saving = $state(false);
	let deleteRequest = $state<{ key: string; trigger: HTMLElement }>();
	let discardAction = $state<() => void>();
	let discardMessage = $state('');
	let discardReturnFocus = $state<HTMLElement>();
	let creating = $state(untrack(() => startCreating));
	let newDays = $state<Weekday[]>([]);
	let blockName = $state(untrack(() => routine.blocks?.[blockKey]?.name ?? ''));
	const blockList = $derived(manageBlocks && !blockKey);
	function addBlock() {
		const name = 'New shared block';
		const created = createBlock($state.snapshot(draft), name);
		draft = created.routine;
		blockKey = created.key;
		pendingBlock = created.key;
		blockName = '';
		errors = [];
	}

	async function deleteBlock(id: string) {
		saving = true;
		errors = [];
		try {
			const candidate = removeBlock($state.snapshot(draft), id);
			await saveRoutine(candidate, revision);
			draft = candidate;
			revision = currentRoutine().revision;
			baseline = JSON.stringify(draft);
		} catch (error) {
			errors = [(error as Error).message];
		} finally {
			saving = false;
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

	function warnBeforeUnload(event: BeforeUnloadEvent) {
		if (dirty) event.preventDefault();
	}
	$effect(() => {
		if (!dirty) return;
		window.addEventListener('beforeunload', warnBeforeUnload);
		return () => window.removeEventListener('beforeunload', warnBeforeUnload);
	});

	function requestDiscard(
		action: () => void,
		message = 'Your unsaved edits will be lost.',
		trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
	) {
		if (!dirty) return action();
		discardMessage = message;
		discardReturnFocus = trigger;
		discardAction = action;
	}
	function discard() {
		const action = discardAction;
		discardAction = undefined;
		action?.();
	}
	beforeNavigate((navigation) => {
		// A custom dialog can intercept app navigation, but not browser refresh/tab close.
		if (!dirty || navigation.type === 'leave' || !navigation.to) return;
		navigation.cancel();
		const destination = navigation.to;
		requestDiscard(() => {
			baseline = JSON.stringify(draft);
			blockName = draft.blocks?.[blockKey]?.name ?? '';
			if (navigation.type === 'popstate') history.go(navigation.delta);
			else if (navigation.willUnload) location.assign(destination.url);
			else void goto(destination.url);
		});
	});
	function cancel(event: MouseEvent) {
		requestDiscard(closeEditor, undefined, event.currentTarget as HTMLElement);
	}
	function closeEditor() {
		if (manageBlocks && blockKey && !startBlock) {
			draft = JSON.parse(baseline);
			blockKey = '';
			pendingBlock = '';
			blockName = '';
			errors = [];
			return;
		}
		baseline = JSON.stringify(draft);
		blockName = draft.blocks?.[blockKey]?.name ?? '';
		onclose(key, false);
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
	function reload(event: MouseEvent) {
		requestDiscard(
			() => void reloadSaved(),
			'Your unsaved edits will be replaced with the latest saved templates.',
			event.currentTarget as HTMLElement
		);
	}
	async function reloadSaved() {
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

{#if discardAction}
	<ConfirmDialog
		title="Discard changes?"
		cancelLabel="Keep editing"
		confirmLabel="Discard changes"
		message={discardMessage}
		returnFocus={discardReturnFocus}
		oncancel={() => (discardAction = undefined)}
		onconfirm={discard}
	/>
{/if}
{#if deleteRequest}
	<ConfirmDialog
		title="Delete shared block?"
		message={`“${draft.blocks![deleteRequest.key].name}” and its items will be deleted.`}
		returnFocus={deleteRequest.trigger}
		oncancel={() => (deleteRequest = undefined)}
		onconfirm={() => {
			if (!deleteRequest) return;
			const { key } = deleteRequest;
			deleteRequest = undefined;
			void deleteBlock(key);
		}}
	/>
{/if}
<section class="template-editor" data-testid="TemplateEditor">
	<div class="editor-heading page-header masthead">
		<div>
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
		{#if blockList}
			<button type="button" data-testid="TemplateEditor-cancel" disabled={saving} onclick={cancel}
				>Done</button
			>
		{:else}
			<div class="editor-toolbar">
				{#if saving || dirty}<span class="save-state" role="status"
						>{saving ? 'Saving…' : 'Unsaved changes'}</span
					>{/if}
				<div class="editor-actions">
					<button data-testid="TemplateEditor-cancel" type="button" disabled={saving} onclick={cancel}
						>Cancel</button
					>
					<button
						data-testid="TemplateEditor-save"
						class="primary"
						type="submit"
						form="routine-editor-form"
						disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button
					>
				</div>
			</div>
		{/if}
	</div>

	<form
		id="routine-editor-form"
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
					<div class="editor-workspace">
						<div class="editor-settings">
							<label
								>Focus<input
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
						</div>
						<div class="editor-timeline">
							<h2 class="template-section-title timeline-heading">Timeline</h2>
							<EntryEditor
								bind:entries={draft.days[key].items}
								routine={draft}
								choices={draft.days[key].choices ?? {}}
								focus={key === templateKey ? focus : undefined}
							/>
						</div>
					</div>
				{/if}
			{:else}
				{#if blockKey && draft.blocks}
					<div class="editor-workspace">
						<div class="editor-settings">
							<label class="block-name-field"
								>Name<input
									data-testid="TemplateEditor-block-name"
									bind:value={blockName}
									placeholder="e.g. Morning routine"
								/></label
							>
							<label
								>Category<select
									data-testid="TemplateEditor-block-category"
									value={draft.blocks[blockKey].category ?? ''}
									onchange={(e) => {
										const block = draft.blocks![blockKey];
										if (e.currentTarget.value) block.category = e.currentTarget.value;
										else delete block.category;
									}}
									><option value="">None</option
									>{#each Object.entries(draft.categories ?? {}) as [id, category] (id)}<option value={id}
											>{category.name}</option
										>{/each}</select
								><span class="help"
									>Colours the block, and every activity in it that doesn't set its own.</span
								></label
							>
						</div>
						<div class="editor-timeline">
							<h2 class="block-items-heading">Activities</h2>
							{#key blockKey}
								<EntryEditor
									routine={draft}
									shared
									bind:entries={
										() => draft.blocks![blockKey].items,
										(items) => (draft.blocks![blockKey].items = items as SharedEntry[])
									}
									focus={blockKey === startBlock ? focus : undefined}
								/>
							{/key}
						</div>
					</div>
				{:else}
					<div class="block-list" data-testid="TemplateEditor-block-list">
						{#each Object.entries(draft.blocks ?? {}) as [name, block]}
							{@const references = blockReferences(draft, name)}
							<article class="block-list-card" data-testid={`TemplateEditor-block-card-${name}`}>
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
									<span class="block-summary"
										><span class="block-title">{block.name}</span><span class="help"
											>{block.items.length} {block.items.length !== 1 ? 'items' : 'item'}</span
										></span
									>
									<svg
										class="block-edit-icon"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.8"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"><path d="m16 3 5 5M3 21l5-1L21 7a2.1 2.1 0 0 0-4-4L4 16l-1 5Z" /></svg
									>
								</button>
								<button
									type="button"
									class="entry-delete"
									data-testid="TemplateEditor-block-delete"
									aria-label={`Delete shared block ${block.name}`}
									title={references.length ? `Used by ${references.join(', ')}` : `Delete ${block.name}`}
									disabled={references.length > 0}
									onclick={(event) => (deleteRequest = { key: name, trigger: event.currentTarget })}
								>
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.8"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg
									>
								</button>
								{#if references.length}<p
										class="help block-references"
										data-testid="TemplateEditor-block-references"
									>
										Used by {references.join(', ')}
									</p>{/if}
							</article>
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
		</fieldset>
	</form>
</section>
