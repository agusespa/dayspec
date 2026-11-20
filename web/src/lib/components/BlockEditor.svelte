<script lang="ts">
	import { renameBlock } from '#lib/routine/edit.ts';
	import type { Routine, SharedEntry } from '#lib/routine/types.ts';
	import EditorSession from './EditorSession.svelte';
	import EntryEditor from './EntryEditor.svelte';
	let {
		routine,
		initialDraft,
		blockKey,
		creating = false,
		focus,
		onclose
	}: {
		routine: Routine;
		initialDraft?: Routine;
		blockKey: string;
		creating?: boolean;
		focus?: number[];
		onclose: (saved: boolean) => void;
	} = $props();
</script>

<EditorSession
	{routine}
	{initialDraft}
	title={creating ? 'New shared block' : 'Edit shared block'}
	prepare={(draft) => renameBlock(draft, blockKey, draft.blocks![blockKey].name)}
	{onclose}
	onreload={(draft) => {
		if (!draft.blocks?.[blockKey]) onclose(false);
	}}
>
	{#snippet children(editor)}
		<div class="editor-workspace">
			<div class="editor-settings">
				<label class="block-name-field"
					>Name<input
						data-testid="TemplateEditor-block-name"
						bind:value={editor.routine.blocks![blockKey].name}
						placeholder="e.g. Morning routine"
					/></label
				>
				<label
					>Category<select
						data-testid="TemplateEditor-block-category"
						value={editor.routine.blocks![blockKey].category ?? ''}
						onchange={(e) => {
							const block = editor.routine.blocks![blockKey];
							if (e.currentTarget.value) block.category = e.currentTarget.value;
							else delete block.category;
						}}
						><option value="">None</option
						>{#each Object.entries(editor.routine.categories ?? {}) as [id, category] (id)}<option value={id}
								>{category.name}</option
							>{/each}</select
					><span class="help">Colours the block, and every activity in it that doesn't set its own.</span
					></label
				>
			</div>
			<div class="editor-timeline">
				<h2 class="block-items-heading">Activities</h2>
				{#key blockKey}
					<EntryEditor
						routine={editor.routine}
						shared
						bind:entries={
							() => editor.routine.blocks![blockKey].items,
							(items) => (editor.routine.blocks![blockKey].items = items as SharedEntry[])
						}
						{focus}
					/>
				{/key}
			</div>
		</div>
	{/snippet}
</EditorSession>
