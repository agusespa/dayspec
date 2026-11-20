<script lang="ts">
	import { untrack } from 'svelte';
	import { routineState, saveRoutine } from '#lib/routine/client.ts';
	import { createBlock, removeBlock, blockReferences, blocksByName } from '#lib/routine/edit.ts';
	import type { Routine } from '#lib/routine/types.ts';
	import BlockEditor from './BlockEditor.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	let {
		routine,
		startBlock = '',
		focus,
		onclose
	}: {
		routine: Routine;
		startBlock?: string;
		focus?: number[];
		onclose: (saved: boolean) => void;
	} = $props();
	let blockKey = $state(untrack(() => (routine.blocks?.[startBlock] ? startBlock : '')));
	let initialDraft = $state<Routine>();
	let creating = $state(false);
	let saving = $state(false);
	let errors = $state<string[]>([]);
	let deleteRequest = $state<{ key: string; label: string; trigger: HTMLElement }>();
	function edit(key: string) {
		blockKey = key;
		creating = false;
		initialDraft = undefined;
		errors = [];
	}
	function addBlock() {
		const created = createBlock(routine, 'New shared block');
		created.routine.blocks![created.key].name = '';
		initialDraft = created.routine;
		blockKey = created.key;
		creating = true;
		errors = [];
	}
	async function deleteBlock(key: string) {
		saving = true;
		errors = [];
		try {
			await saveRoutine(removeBlock(routine, key), $routineState.revision);
		} catch (error) {
			errors = [(error as Error).message];
		} finally {
			saving = false;
		}
	}
</script>

{#if blockKey}
	<BlockEditor
		{routine}
		{initialDraft}
		{blockKey}
		{creating}
		focus={blockKey === startBlock ? focus : undefined}
		onclose={(saved) => {
			if (saved || startBlock) onclose(saved);
			else {
				blockKey = '';
				initialDraft = undefined;
				creating = false;
			}
		}}
	/>
{:else}
	{#if deleteRequest}
		<ConfirmDialog
			title="Delete shared block?"
			message={`“${deleteRequest.label}” and its items will be deleted.`}
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
			<div><h1>Shared blocks</h1></div>
			<button
				type="button"
				data-testid="TemplateEditor-cancel"
				disabled={saving}
				onclick={() => onclose(false)}>Done</button
			>
		</div>
		<fieldset disabled={saving}>
			<div class="block-list" data-testid="TemplateEditor-block-list">
				{#each blocksByName(routine) as [name, block]}
					{@const references = blockReferences(routine, name)}
					<article class="block-list-card" data-testid={`TemplateEditor-block-card-${name}`}>
						<button
							type="button"
							class="block-list-row"
							data-testid={`TemplateEditor-block-${name}`}
							onclick={() => edit(name)}
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
							onclick={(event) =>
								(deleteRequest = { key: name, label: block.name, trigger: event.currentTarget })}
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
			{#if errors.length}<div class="editor-errors" role="alert" data-testid="TemplateEditor-errors">
					<strong>Changes haven’t been saved</strong>
					<ul>
						{#each errors as error}<li>{error}</li>{/each}
					</ul>
				</div>{/if}
		</fieldset>
	</section>
{/if}
