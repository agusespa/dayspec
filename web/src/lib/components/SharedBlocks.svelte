<script lang="ts">
	import { routineState, saveRoutine } from '#lib/routine/client.ts';
	import { removeBlock, blockReferences, blocksByName, type RemoveBlockMode } from '#lib/routine/edit.ts';
	import type { Routine } from '#lib/routine/types.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import Dialog from './Dialog.svelte';
	let {
		routine,
		disabled = false,
		onedit,
		onadd
	}: {
		routine: Routine;
		disabled?: boolean;
		onedit: (key: string) => void;
		onadd: () => void;
	} = $props();
	let saving = $state(false);
	let error = $state('');
	let deleteRequest = $state<{ key: string; label: string; references: string[]; trigger: HTMLElement }>();
	async function deleteBlock(key: string, mode?: RemoveBlockMode) {
		saving = true;
		error = '';
		try {
			await saveRoutine(removeBlock(routine, key, mode), $routineState.revision);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not delete this routine. Try again.';
		} finally {
			saving = false;
		}
	}
	function remove(mode: RemoveBlockMode) {
		if (!deleteRequest) return;
		const { key } = deleteRequest;
		deleteRequest = undefined;
		void deleteBlock(key, mode);
	}
</script>

{#if deleteRequest?.references.length}
	<Dialog
		title="Delete routine?"
		description={`“${deleteRequest.label}” is used by ${deleteRequest.references.join(', ')}. Keep its activities there as separate items, or remove them along with the routine.`}
		width="420px"
		returnFocus={deleteRequest.trigger}
		oncancel={() => (deleteRequest = undefined)}
	>
		{#snippet actions()}
			<div class="delete-actions">
				<button
					type="button"
					class="keep"
					data-testid="SharedBlocks-delete-explode"
					onclick={() => remove('explode')}>Keep activities</button
				>
				<button
					type="button"
					class="danger"
					data-testid="SharedBlocks-delete-remove"
					onclick={() => remove('remove')}>Remove everywhere</button
				>
				<button type="button" class="cancel" onclick={() => (deleteRequest = undefined)}>Cancel</button>
			</div>
		{/snippet}
	</Dialog>
{:else if deleteRequest}
	<ConfirmDialog
		title="Delete routine?"
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
<section class="shared-blocks" data-testid="SharedBlocks">
	<h2 class="section-label">Routines</h2>
	<p class="intro">Reusable sequences of activities you can drop into any template.</p>
	<div class="block-list" data-testid="SharedBlocks-list">
		{#each blocksByName(routine) as [name, block] (name)}
			{@const references = blockReferences(routine, name)}
			<article class="block-card" data-testid={`SharedBlocks-card-${name}`}>
				<div class="block-summary">
					<span class="block-title">{block.name}</span>
					<span class="block-meta"
						>{block.items.length}
						{block.items.length !== 1 ? 'items' : 'item'}{references.length
							? ` · Used by ${references.join(', ')}`
							: ''}</span
					>
				</div>
				<button
					type="button"
					class="icon-button"
					data-testid={`SharedBlocks-edit-${name}`}
					aria-label={`Edit routine ${block.name}`}
					title={`Edit ${block.name}`}
					disabled={disabled || saving}
					onclick={() => onedit(name)}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="m16 3 5 5M3 21l5-1L21 7a2.1 2.1 0 0 0-4-4L4 16l-1 5Z" /></svg
					>
				</button>
				<button
					type="button"
					class="icon-button delete"
					data-testid="SharedBlocks-delete"
					aria-label={`Delete routine ${block.name}`}
					title={`Delete ${block.name}`}
					disabled={disabled || saving}
					onclick={(event) =>
						(deleteRequest = { key: name, label: block.name, references, trigger: event.currentTarget })}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg
					>
				</button>
			</article>
		{:else}<p class="intro" data-testid="SharedBlocks-empty">No routines yet.</p>{/each}
	</div>
	<button
		type="button"
		class="add-block"
		data-testid="SharedBlocks-new"
		disabled={disabled || saving}
		onclick={onadd}>+ New routine</button
	>
	{#if error}<p class="error" role="alert" data-testid="SharedBlocks-error">{error}</p>{/if}
</section>

<style>
	.shared-blocks {
		margin-top: 2.25rem;
	}
	.intro {
		margin: 0.35rem 0 0;
		color: var(--muted);
		font-size: var(--text-xs);
		line-height: 1.6;
	}
	.block-list {
		display: grid;
		gap: 0.6rem;
		margin: 0.9rem 0;
	}
	.block-card {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.4rem 0.4rem 0.4rem 1.1rem;
		border: 1px solid var(--rule);
		border-radius: var(--radius);
		background: var(--paper);
	}
	.block-summary {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 0.2rem;
		padding: 0.5rem 0;
	}
	.block-title {
		font-size: var(--text-lg);
		font-weight: 650;
		letter-spacing: -0.025em;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.block-meta {
		color: var(--muted);
		font-size: var(--text-xs);
		overflow-wrap: anywhere;
	}
	.icon-button {
		flex: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		padding: 0.6rem;
		border-radius: 50%;
		color: var(--secondary);
	}
	.icon-button:not(:disabled):hover {
		background: var(--now-wash);
	}
	.icon-button.delete,
	.error {
		color: var(--danger);
	}
	.icon-button:disabled,
	.add-block:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.icon-button svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.add-block {
		height: 46px;
		padding: 0 1rem;
		border: 1px solid var(--rule);
		border-radius: 10px;
		background: var(--paper);
		color: var(--secondary);
		font-size: var(--text-sm);
	}
	.error {
		font-size: var(--text-sm);
	}
	.delete-actions {
		display: grid;
		gap: 0.5rem;
		width: 100%;
	}
	.delete-actions button {
		min-height: 44px;
		padding-inline: 1rem;
		font-size: var(--text-sm);
	}
	.delete-actions .keep {
		background: var(--accent);
		color: var(--accent-text);
	}
	.delete-actions .danger {
		background: var(--danger);
		color: var(--accent-text);
	}
	.delete-actions .cancel {
		border: 1px solid var(--rule);
		background: var(--inset);
	}
	@media (min-width: 1024px) {
		.block-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
