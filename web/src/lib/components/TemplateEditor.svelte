<script lang="ts">
	import { untrack } from 'svelte';
	import { createTemplate, assignTemplateDays, templateName, availableDays } from '#lib/routine/edit.ts';
	import { WEEKDAYS, type Routine, type Weekday } from '#lib/routine/types.ts';
	import { weekdayLabel } from '#lib/routine/outline.ts';
	import EditorSession, { type EditorDraft } from './EditorSession.svelte';
	import EntryEditor from './EntryEditor.svelte';
	import ChoiceEditor from './ChoiceEditor.svelte';
	import { templateOverlaps } from '#lib/routine/overlaps.ts';
	let {
		routine,
		templateKey,
		startCreating = false,
		focus,
		onclose
	}: {
		routine: Routine;
		templateKey: string;
		startCreating?: boolean;
		focus?: number[];
		onclose: (key: string) => void;
	} = $props();
	let key = $state(untrack(() => templateKey));
	let creating = $state(untrack(() => startCreating || !routine.templates[templateKey]));
	let newDays = $state<Weekday[]>([]);
	function addTemplate(editor: EditorDraft) {
		try {
			const created = createTemplate($state.snapshot(editor.routine), newDays);
			editor.routine = created.routine;
			key = created.key;
			creating = false;
			newDays = [];
			editor.errors = [];
		} catch (error) {
			editor.errors = [(error as Error).message];
		}
	}
	function changeDay(editor: EditorDraft, day: Weekday, checked: boolean) {
		try {
			const days = checked
				? [...editor.routine.templates[key].on, day]
				: editor.routine.templates[key].on.filter((d) => d !== day);
			editor.routine = assignTemplateDays($state.snapshot(editor.routine), key, days);
			editor.errors = [];
		} catch (error) {
			editor.errors = [(error as Error).message];
		}
	}
	function reloaded(routine: Routine) {
		if (!routine.templates[key]) key = Object.keys(routine.templates)[0] ?? '';
		creating = !key;
		newDays = [];
	}
</script>

<EditorSession
	{routine}
	title={creating ? 'New template' : 'Edit template'}
	onclose={() => onclose(key)}
	onreload={reloaded}
>
	{#snippet children(editor)}
		{#if creating}
			<section class="new-template" data-testid="TemplateEditor-create">
				<h2>{templateName(newDays)}</h2>

				<div class="day-pills">
					{#each WEEKDAYS as weekday}
						<label class="day-pill"
							><input
								type="checkbox"
								data-testid={`TemplateEditor-new-${weekday}`}
								disabled={!availableDays(editor.routine).includes(weekday)}
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
					onclick={() => addTemplate(editor)}>Create template</button
				>
			</section>
		{/if}
		{#if !creating}
			{@const overlaps = templateOverlaps(editor.routine, key)}
			<div class="editor-workspace">
				<div class="editor-settings">
					<label
						>Focus<input
							data-testid="TemplateEditor-theme"
							value={editor.routine.templates[key].theme ?? ''}
							placeholder="e.g. Deep work + family time"
							oninput={(e) => {
								const value = e.currentTarget.value;
								if (value) editor.routine.templates[key].theme = value;
								else delete editor.routine.templates[key].theme;
							}}
						/></label
					>
					<span class="field-label">Applies on</span>
					<div class="day-pills">
						{#each WEEKDAYS as weekday}<label class="day-pill"
								><input
									type="checkbox"
									checked={editor.routine.templates[key].on.includes(weekday)}
									data-testid={`TemplateEditor-day-${weekday}`}
									disabled={!availableDays(editor.routine, key).includes(weekday)}
									onchange={(e) => {
										changeDay(editor, weekday, e.currentTarget.checked);
										e.currentTarget.checked = editor.routine.templates[key].on.includes(weekday);
									}}
								/>{weekdayLabel(weekday)}</label
							>{/each}
					</div>

					<ChoiceEditor bind:routine={editor.routine} template={key} />
				</div>
				<div class="editor-timeline">
					<h2 class="template-section-title timeline-heading">Timeline</h2>
					{#if overlaps.length}
						<div class="editor-warning" role="alert" data-testid="TemplateEditor-overlaps">
							<strong
								>{overlaps.length === 1 ? 'Two activities overlap' : `${overlaps.length} overlaps`}</strong
							>
							<ul>
								{#each overlaps as overlap}<li>
										{overlap.second.title} starts at
										<span class="mono">{overlap.second.time}</span>, before {overlap.first.title}
										ends at <span class="mono">{overlap.first.end}</span>{#if overlap.when.length}{' '}<span
												class="help">· {overlap.when.join(', ')}</span
											>{/if}
									</li>{/each}
							</ul>
						</div>
					{/if}
					<EntryEditor
						bind:entries={editor.routine.templates[key].items}
						routine={editor.routine}
						choices={editor.routine.templates[key].choices ?? {}}
						focus={key === templateKey ? focus : undefined}
					/>
				</div>
			</div>
		{/if}
	{/snippet}
</EditorSession>
