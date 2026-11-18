<script lang="ts">
	import BottomNav from '#lib/components/BottomNav.svelte';
	import { availableDays, templateName, templateKeys, removeTemplate } from '#lib/routine/edit.ts';
	import { routineState, saveRoutine } from '#lib/routine/client.ts';
	import { untrack } from 'svelte';
	import TemplateEditor from '#lib/components/TemplateEditor.svelte';
	import '#lib/styles/editor.css';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { outlineDay, weekdayLabel, type OutlineOption } from '#lib/routine/outline.ts';
	import Timeline from '#lib/components/Timeline.svelte';
	import TimelineItem from '#lib/components/TimelineItem.svelte';
	let editing = $state(false);
	let creating = $state(false);
	let managingBlocks = $state(false);
	let saved = $state(false);
	let removing = $state(false);
	let error = $state('');
	const routine = $derived($routineState.routine);
	const keys = $derived(templateKeys(routine));
	const remaining = $derived(availableDays(routine));
	const holiday = $derived(routine.settings?.holiday ?? '');
	let key = $state(untrack(() => page.url.searchParams.get('t') ?? ''));
	const selectedKey = $derived(keys.includes(key) ? key : (keys[0] ?? ''));
	async function remove(next: string) {
		if (removing) return;
		const label = templateName($routineState.routine.days[next].on);
		if (
			!confirm(
				`Delete the ${label} template and its items? Its days will become available for a new template.`
			)
		)
			return;
		removing = true;
		error = '';
		saved = false;
		try {
			await saveRoutine(removeTemplate($routineState.routine, next), $routineState.revision);
			if (key === next) {
				key = '';
				replaceState('/templates', {});
			}
			saved = true;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not delete this template. Try again.';
		} finally {
			removing = false;
		}
	}
	function edit(next: string) {
		key = next;
		creating = false;
		managingBlocks = false;
		editing = true;
		saved = false;
	}
	function pick(next: string) {
		key = key === next ? '' : next;
		replaceState(key ? `?t=${key}` : '/templates', {});
	}
	function optionNote(option: OutlineOption, count: number): string {
		const notes: string[] = [];
		if (option.defaultOn.length === count) notes.push('default');
		else if (option.defaultOn.length) notes.push(`default ${option.defaultOn.map(weekdayLabel).join(', ')}`);
		if (option.onlyOn) notes.push(`only ${option.onlyOn.map(weekdayLabel).join(', ')}`);
		return notes.join(' · ');
	}
</script>

{#snippet tags(conditions: string[])}
	{#if conditions.length}
		<div class="tags">
			{#each conditions as condition (condition)}<span class="tag">{condition}</span>{/each}
		</div>
	{/if}
{/snippet}

{#if editing}
	<TemplateEditor
		{routine}
		templateKey={selectedKey}
		startCreating={creating}
		manageBlocks={managingBlocks}
		onclose={(next, didSave) => {
			key = next;
			editing = false;
			saved = didSave;
			replaceState(key ? `?t=${key}` : '/templates', {});
		}}
	/>
{:else}
	<section class="masthead">
		<p class="eyebrow library-title">Routine library</p>
		<h1>Templates</h1>
	</section>
	{#if saved}<p class="saved-note" role="status" data-testid="Templates-saved">Templates saved</p>{/if}
	{#if error}<p role="alert" class="delete-error" data-testid="Templates-delete-error">{error}</p>{/if}
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
						<span class="template-meta"
							>{day.on.map(weekdayLabel).join(' · ')}{k === holiday ? ' · Holidays' : ''}</span
						>
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
						disabled={!$routineState.online || removing}
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
						disabled={!$routineState.online || removing}
						onclick={() => remove(k)}
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
						{#if day.choices.length}
							<h2 class="section-label">Choices</h2>
							<section class="choices rules">
								{#each day.choices as choice (choice.name)}
									<div class="choice">
										<span class="choice-label">{choice.label}</span>
										<div>
											<ul class="option-list">
												{#each choice.options as option (option.label)}<li>
														<span class="option" class:default={option.defaultOn.length}>{option.label}</span
														>{#if optionNote(option, day.on.length)}<span class="option-note"
																>{optionNote(option, day.on.length)}</span
															>{/if}
													</li>{/each}
											</ul>
											{#if choice.activeWhen.length}<p class="active-when">
													Only when {choice.activeWhen.join(' + ')}
												</p>{/if}
										</div>
									</div>
								{/each}
							</section>
						{/if}
						{#if !day.items.length}<p class="empty-preview" data-testid="Templates-empty">
								No routine items yet.
							</p>{/if}
						<h2 class="section-label">Timeline · {day.items.length} items</h2>
						<Timeline items={day.items}>
							{#snippet row(item)}<TimelineItem {item}>
									{@render tags(item.conditions)}
								</TimelineItem>{/snippet}
						</Timeline>
					</div>
				{/if}
			</article>
		{:else}
			<section class="empty-state" data-testid="Templates-empty-library">
				<h2>Your routine starts here</h2>
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
		<div class="template-actions">
			<button
				class="manage-blocks"
				data-testid="Templates-blocks"
				disabled={!$routineState.online || removing}
				onclick={() => {
					managingBlocks = true;
					creating = false;
					editing = true;
					saved = false;
				}}>Manage shared blocks</button
			>
			{#if remaining.length}
				<button
					class="add-button"
					data-testid="Templates-new"
					disabled={!$routineState.online || removing}
					onclick={() => {
						creating = true;
						managingBlocks = false;
						editing = true;
						saved = false;
					}}>+ Add template</button
				>
			{/if}
		</div>
	</section>
{/if}
<div class="bar-room"></div>
<BottomNav />

<style>
	.library-title {
		font-size: 1.15rem;
		font-weight: 600;
		line-height: 1.4;
	}
	.manage-blocks {
		margin: 0;
		border: 1px solid var(--rule);
		border-radius: 10px;
		color: var(--secondary);
		background: var(--surface);
		font-size: 0.8rem;
	}
	.manage-blocks:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.template-list {
		display: grid;
		gap: 0.85rem;
		margin-top: 1.5rem;
	}
	.template-card {
		--card-accent: var(--accent);
		transition: border-color 0.16s ease;
		border: 1px solid var(--rule);
		border-left: 2px solid var(--card-accent);
		border-radius: 12px;
		background: var(--paper);
		overflow: hidden;
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
	.template-name {
		font-family: var(--sans);
		font-size: 1.15rem;
		font-weight: 650;
		letter-spacing: -0.025em;
		line-height: 1.25;
	}
	.template-meta,
	.template-count,
	.template-theme {
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--muted);
	}
	.template-theme {
		color: var(--text);
		font-size: 0.85rem;
	}
	.template-count {
		font-size: 0.75rem;
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
	.template-edit:disabled,
	.add-button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.template-edit svg {
		width: 22px;
		height: 22px;
	}
	.template-delete {
		color: var(--muted);
	}
	.template-delete:hover,
	.delete-error {
		color: var(--danger);
	}
	.delete-error {
		font-size: 0.85rem;
		line-height: 1.6;
	}
	.template-preview {
		border-top: 1px solid var(--rule);
		padding: 0 1rem 1rem;
	}
	.empty-preview,
	.add-template p {
		color: var(--muted);
		font-size: 0.8rem;
		line-height: 1.7;
	}
	.add-template {
		margin-top: 1.25rem;
	}
	.template-actions button {
		box-sizing: border-box;
		height: 46px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.template-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.add-template p {
		margin: 0 0 0.85rem;
	}
	.field-label {
		color: var(--text);
		font-weight: 600;
	}
	.add-button {
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 10px;
		padding: 0.75rem 1rem;
	}
	.saved-note {
		color: var(--accent);
		font-size: 0.8rem;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin: -0.3rem 0 0.5rem var(--indent);
	}

	.tag {
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		background: var(--now-wash);
		color: var(--accent);
		font-family: var(--sans);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.rules .choice {
		align-items: start;
		padding: 0.7rem 0;
	}

	.rules .choice-label {
		padding-top: 0.2rem;
	}

	.option-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.option-list li {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0 0.5rem;
	}

	.option {
		color: var(--muted);
	}

	.option.default {
		color: var(--text);
		font-weight: 600;
	}

	.option-note,
	.active-when {
		font-family: var(--sans);
		font-size: 0.7rem;
		color: var(--muted);
	}

	.active-when {
		margin: 0.4rem 0 0;
		color: var(--accent);
	}

	.template-card:hover {
		border-color: var(--card-accent);
		box-shadow: 0 0 20px color-mix(in srgb, var(--card-accent) 8%, transparent);
	}
	.template-meta {
		color: var(--tertiary);
	}
	.add-button:not(:disabled):hover {
		background: var(--accent-hover);
	}
	.template-open:hover {
		background: transparent;
	}

	.template-card:nth-child(3n + 2) {
		--card-accent: var(--secondary);
	}
	.template-card:nth-child(3n) {
		--card-accent: var(--tertiary);
	}
	.template-card .template-name {
		color: var(--text);
	}
	.field-label {
		color: var(--tertiary);
	}
</style>
