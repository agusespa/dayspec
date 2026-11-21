<script module lang="ts">
	import type { Routine } from '#lib/routine/types.ts';
	export interface EditorDraft {
		routine: Routine;
		errors: string[];
	}
</script>

<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { untrack, type Snippet } from 'svelte';
	import schema from '../../../../routine.schema.json';
	import { cloneRoutine } from '#lib/routine/edit.ts';
	import { routineState, loadRoutine, saveRoutine, currentRoutine } from '#lib/routine/client.ts';
	import { validateRoutine } from '#lib/routine/validate.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';
	let {
		routine,
		initialDraft,
		title,
		backLabel = 'Templates',
		subtitle,
		prepare,
		onreload,
		onsaved,
		onclose,
		children
	}: {
		routine: Routine;
		initialDraft?: Routine;
		title: string;
		/** Where the back button returns to. */
		backLabel?: string;
		subtitle?: Snippet<[EditorDraft]>;
		prepare?: (routine: Routine) => Routine;
		onreload?: (routine: Routine) => void;
		onsaved?: () => void;
		onclose: () => void;
		children: Snippet<[EditorDraft]>;
	} = $props();
	const editor = $state<EditorDraft>({
		routine: cloneRoutine(untrack(() => initialDraft ?? routine)),
		errors: []
	});
	let revision = $state(untrack(() => $routineState.revision));
	let baseline = $state(untrack(() => JSON.stringify(routine)));
	let saving = $state(false);
	let savedOnce = $state(false);
	let discardAction = $state<() => void>();
	let discardMessage = $state('');
	let discardReturnFocus = $state<HTMLElement>();
	const dirty = $derived(JSON.stringify(editor.routine) !== baseline);
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
		// App navigation uses our dialog; browser refresh/tab close keeps the browser's warning.
		if (!dirty || navigation.type === 'leave' || !navigation.to) return;
		navigation.cancel();
		const destination = navigation.to;
		requestDiscard(() => {
			baseline = JSON.stringify(editor.routine);
			if (navigation.type === 'popstate') history.go(navigation.delta);
			else if (navigation.willUnload) location.assign(destination.url);
			else void goto(destination.url);
		});
	});
	function back(event: MouseEvent) {
		requestDiscard(
			() => {
				baseline = JSON.stringify(editor.routine);
				onclose();
			},
			undefined,
			event.currentTarget as HTMLElement
		);
	}
	async function save() {
		editor.errors = [];
		try {
			const snapshot = $state.snapshot(editor.routine);
			const candidate = prepare ? prepare(snapshot) : snapshot;
			editor.errors = validateRoutine(candidate, schema);
			if (editor.errors.length) return;
			saving = true;
			await saveRoutine(candidate, revision);
			// Stay in the editor: the next save builds on the revision this one created.
			revision = currentRoutine().revision;
			baseline = JSON.stringify(editor.routine);
			savedOnce = true;
			onsaved?.();
		} catch (error) {
			// The server reports each invalid reference on its own line.
			editor.errors =
				error instanceof Error
					? error.message.split('\n')
					: ['Could not save. Your draft is still open; try again.'];
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
		editor.routine = cloneRoutine(latest.routine);
		revision = latest.revision;
		baseline = JSON.stringify(editor.routine);
		editor.errors = [];
		onreload?.(editor.routine);
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
<section class="template-editor" data-testid="TemplateEditor">
	<div class="editor-heading page-header masthead">
		<div>
			<button
				data-testid="TemplateEditor-back"
				type="button"
				class="editor-back"
				disabled={saving}
				onclick={back}
				><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>{backLabel}</button
			>
			<h1>{title}</h1>
			{@render subtitle?.(editor)}
		</div>
		<div class="editor-toolbar">
			<span
				class="save-state"
				class:saved={!saving && !dirty && savedOnce}
				role="status"
				data-testid="TemplateEditor-status"
				>{saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedOnce ? 'All changes saved' : ''}</span
			>
			<div class="editor-actions">
				<button
					data-testid="TemplateEditor-save"
					class="primary"
					type="submit"
					form="routine-editor-form"
					disabled={saving || !dirty}>{saving ? 'Saving…' : dirty || !savedOnce ? 'Save' : 'Saved'}</button
				>
			</div>
		</div>
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
			{@render children(editor)}
			{#if changedElsewhere}<p class="help" role="status" data-testid="TemplateEditor-remote-change">
					Templates changed on another device. Your draft is kept. Reload saved templates to use the latest
					version.
				</p>{/if}
			{#if editor.errors.length}
				<div class="editor-errors" role="alert" data-testid="TemplateEditor-errors">
					<strong>Changes haven’t been saved</strong>
					<ul>
						{#each editor.errors as error}<li>{error}</li>{/each}
					</ul>
				</div>
			{/if}
			{#if editor.errors.length || changedElsewhere}<button
					data-testid="TemplateEditor-reload"
					type="button"
					onclick={reload}>Reload saved templates</button
				>{/if}
		</fieldset>
	</form>
</section>
