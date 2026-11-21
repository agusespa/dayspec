<script lang="ts">
	import BottomNav from '#lib/components/BottomNav.svelte';
	import { availableDays, templateKeys, removeTemplate, createBlock } from '#lib/routine/edit.ts';
	import { routineState, saveRoutine } from '#lib/routine/client.ts';
	import { untrack } from 'svelte';
	import TemplateEditor from '#lib/components/TemplateEditor.svelte';
	import SharedBlocks from '#lib/components/SharedBlocks.svelte';
	import BlockEditor from '#lib/components/BlockEditor.svelte';
	import type { Routine } from '#lib/routine/types.ts';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import '#lib/styles/editor.css';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { outlineDay, weekdayLabel } from '#lib/routine/outline.ts';
	import TemplateTimeline from '#lib/components/TemplateTimeline.svelte';
	// An item's edit link on Today lands here with ?t= or ?block= plus the entry position in ?edit=.
	const linked = untrack(() => {
		const params = page.url.searchParams;
		const edit = params.get('edit');
		const block = params.get('block') ?? '';
		const path = edit ? edit.split('.').map(Number) : [];
		if (!(edit || block) || !path.every((n) => Number.isInteger(n) && n >= 0)) return undefined;
		return { block, path };
	});
	let editing = $state(!!linked && !linked.block);
	let creating = $state(false);
	// The routine (shared block) being edited, with the unsaved draft that adds it when it is new.
	let block = $state<{ key: string; draft?: Routine }>();
	let deleting = $state(false);
	let deleteError = $state('');
	let deleteRequest = $state<{ key: string; label: string; trigger: HTMLElement }>();
	const routine = $derived($routineState.routine);
	const keys = $derived(templateKeys(routine));
	const remaining = $derived(availableDays(routine));
	const holiday = $derived(routine.settings?.holiday_template ?? '');
	let key = $state(untrack(() => page.url.searchParams.get('t') ?? ''));
	untrack(() => {
		if (linked?.block && routine.blocks?.[linked.block]) block = { key: linked.block };
	});
	const selectedKey = $derived(keys.includes(key) ? key : (keys[0] ?? ''));
	function edit(next: string) {
		deleteError = '';
		key = next;
		creating = false;
		editing = true;
	}
	function addBlock() {
		const created = createBlock(routine, 'New routine');
		created.routine.blocks![created.key].name = '';
		block = { key: created.key, draft: created.routine };
	}
	async function remove(keyToDelete: string) {
		deleting = true;
		deleteError = '';
		try {
			await saveRoutine(removeTemplate(routine, keyToDelete), $routineState.revision);
			if (key === keyToDelete) {
				key = '';
				replaceState('/templates', {});
			}
		} catch (error) {
			deleteError = error instanceof Error ? error.message : 'Could not delete this template. Try again.';
		} finally {
			deleting = false;
		}
	}
	function closeEditor() {
		if (linked) return void goto('/');
		// Back on the list every preview starts collapsed.
		key = '';
		editing = false;
		block = undefined;
		replaceState('/templates', {});
	}

	function pick(next: string) {
		key = key === next ? '' : next;
		replaceState(key ? `?t=${key}` : '/templates', {});
	}
</script>

{#if deleteRequest}
	<ConfirmDialog
		title={`Delete ${deleteRequest.label} template?`}
		message="The template and its activities will be deleted. Its days will become available for a new template."
		returnFocus={deleteRequest.trigger}
		oncancel={() => (deleteRequest = undefined)}
		onconfirm={() => {
			if (!deleteRequest) return;
			const { key } = deleteRequest;
			deleteRequest = undefined;
			void remove(key);
		}}
	/>
{/if}
{#if block}
	<BlockEditor
		{routine}
		initialDraft={block.draft}
		blockKey={block.key}
		creating={!!block.draft}
		focus={block.key === linked?.block ? linked.path : undefined}
		onclose={closeEditor}
	/>
{:else if editing}
	<TemplateEditor
		{routine}
		templateKey={selectedKey}
		startCreating={creating}
		focus={linked?.path}
		onclose={closeEditor}
	/>
{:else}
	<section class="masthead page-header">
		<h1>Templates</h1>
	</section>
	{#if deleteError}<p class="delete-error" role="alert" data-testid="Templates-delete-error">
			{deleteError}
		</p>{/if}
	<div class="template-list" data-testid="Templates-list">
		{#each keys as k (k)}
			{@const day = outlineDay(routine, k)}
			<article class="template-card" data-testid={`Templates-row-${k}`}>
				<header class="template-card-heading">
					<button
						class="template-open"
						data-testid="Templates-open"
						aria-expanded={key === k}
						aria-controls={`preview-${k}`}
						onclick={() => pick(k)}
					>
						<span class="template-name" data-testid="Templates-name">{day.label}</span>
						{#if k === holiday}<span class="template-meta">Also used on holidays</span>{/if}
						{#if day.theme}<span class="template-theme" data-testid="Templates-theme">{day.theme}</span>{/if}
						<span class="template-count"
							>{day.items.length}
							{day.items.length === 1 ? 'item' : 'items'}
							<span aria-hidden="true">· {key === k ? 'Hide routine ↑' : 'View routine ↓'}</span></span
						>
					</button>
					<button
						class="template-edit"
						data-testid="Templates-edit"
						aria-label={`Edit ${day.label} template`}
						title={`Edit ${day.label} template`}
						disabled={!$routineState.online || deleting}
						onclick={() => edit(k)}
					>
						<svg
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
						class="template-edit template-delete"
						data-testid="Templates-delete"
						aria-label={`Delete ${day.label} template`}
						title={`Delete ${day.label} template`}
						disabled={!$routineState.online || deleting}
						onclick={(event) => (deleteRequest = { key: k, label: day.label, trigger: event.currentTarget })}
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
				</header>
				{#if key === k}
					<div class="template-preview" id={`preview-${k}`}>
						{#if !day.items.length}<p class="empty-preview" data-testid="Templates-empty">
								No activities yet.
							</p>{/if}
						<h2 class="section-label template-section-title timeline-heading">
							Timeline <span class="template-section-count">{day.items.length} items</span>
						</h2>
						<TemplateTimeline {routine} template={k} />
					</div>
				{/if}
			</article>
		{:else}
			<section class="empty-state" data-testid="Templates-empty-library">
				<h2>Your day starts here</h2>
			</section>
		{/each}
	</div>
	<section class="add-template" data-testid={remaining.length ? 'Templates-unassigned' : undefined}>
		{#if remaining.length}
			<p>
				<span class="field-label">Days without a template</span><br />{remaining
					.map(weekdayLabel)
					.join(' · ')}
			</p>
		{/if}
		{#if remaining.length}
			<div class="template-actions">
				<button
					class="add-button"
					data-testid="Templates-new"
					disabled={!$routineState.online || deleting}
					onclick={() => {
						creating = true;
						editing = true;
					}}>+ Add template</button
				>
			</div>
		{/if}
	</section>
	<SharedBlocks
		{routine}
		disabled={!$routineState.online || deleting}
		onedit={(next) => (block = { key: next })}
		onadd={addBlock}
	/>
{/if}
{#if !editing && !block}
	<div class="bar-room"></div>
	<BottomNav />
{/if}

<style>
	.template-list {
		display: grid;
		gap: 0.85rem;
		margin-top: 1.5rem;
	}
	.template-card {
		border: 1px solid var(--rule);
		border-radius: var(--radius);
		background: var(--paper);
		overflow: hidden;
		transition: border-color 0.16s ease;
	}
	.template-card:hover {
		border-color: var(--surface-hover);
	}
	.template-card-heading {
		display: flex;
		align-items: flex-start;
		padding: 0.65rem;
		gap: 0.25rem;
	}
	.template-open {
		font-weight: 400;
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
		text-align: left;
		padding: 0.8rem;
	}
	.template-open:hover {
		background: transparent;
	}
	.template-name {
		font-family: var(--sans);
		font-size: var(--text-lg);
		font-weight: 650;
		letter-spacing: -0.025em;
		line-height: 1.25;
		color: var(--text);
	}
	.template-meta,
	.template-count {
		font-size: var(--text-xs);
		line-height: 1.5;
		color: var(--muted);
	}
	.template-meta {
		color: var(--tertiary);
	}
	.template-theme {
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text);
	}
	.template-count {
		margin-top: 0.25rem;
	}
	.template-edit {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 44px;
		height: 44px;
		padding: 0.65rem;
		margin-top: 0.25rem;
		border-radius: 50%;
		color: var(--secondary);
	}
	.template-edit:hover {
		background: var(--now-wash);
	}
	.template-delete,
	.delete-error {
		color: var(--danger);
	}
	.template-delete:hover {
		background: color-mix(in srgb, var(--danger) 10%, transparent);
	}
	.delete-error {
		font-size: var(--text-sm);
	}
	.template-edit svg {
		width: 22px;
		height: 22px;
	}
	.template-edit:disabled,
	.template-actions button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.template-preview {
		border-top: 1px solid var(--rule);
		padding: 0 1rem 1rem;
	}
	.empty-preview,
	.add-template p {
		color: var(--muted);
		font-size: var(--text-xs);
		line-height: 1.7;
	}
	.add-template {
		margin-top: 1.25rem;
	}
	.add-template p {
		margin: 0 0 0.85rem;
	}
	.field-label {
		color: var(--tertiary);
		font-weight: 600;
	}
	.template-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.template-actions button {
		height: 46px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 10px;
		font-size: var(--text-sm);
	}
	.add-button {
		background: var(--accent);
		color: var(--accent-text);
		padding: 0.75rem 1rem;
	}
	.add-button:not(:disabled):hover {
		background: var(--accent-hover);
	}
	@media (min-width: 1024px) {
		.template-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			align-items: start;
			gap: 1.25rem;
		}
	}
</style>
