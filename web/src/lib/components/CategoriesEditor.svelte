<!-- Profile's list of item categories: rename, recolour, add and delete. Every change saves at once. -->
<script lang="ts">
	import { routineState, saveRoutine } from '#lib/routine/client.ts';
	import { categoryReferences, createCategory, removeCategory, updateCategory } from '#lib/routine/edit.ts';
	import { CATEGORY_COLORS, type Routine } from '#lib/routine/types.ts';

	let saving = $state(false);
	let error = $state('');
	let open = $state<string | null>(null);
	/** Bumped when a change doesn't stick, so the inputs show the saved values again. */
	let attempt = $state(0);
	const routine = $derived($routineState.routine);
	const categories = $derived(Object.entries(routine.categories ?? {}));
	const disabled = $derived(saving || !$routineState.online);

	async function save(change: (routine: Routine) => Routine) {
		const { routine, revision } = $routineState;
		error = '';
		let next: Routine;
		try {
			next = change(routine);
		} catch (cause) {
			error = (cause as Error).message;
			attempt++;
			return;
		}
		saving = true;
		try {
			await saveRoutine(next, revision);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not save categories.';
			attempt++;
		} finally {
			saving = false;
		}
	}

	function add() {
		save((routine) => {
			const created = createCategory(routine);
			open = created.key;
			return created.routine;
		});
	}
</script>

<section class="categories" aria-labelledby="categories-heading">
	<h2 id="categories-heading">Categories</h2>
	<p class="help">Colour activities and routines on the timeline.</p>
	{#key attempt}
		<ul>
			{#each categories as [key, category] (key)}
				{@const usedBy = categoryReferences(routine, key)}
				<li class="tone-{category.color}" data-testid="Category">
					<details
						open={open === key}
						ontoggle={(e) => {
							if (e.currentTarget.open) open = key;
							else if (open === key) open = null;
						}}
					>
						<summary data-testid="Category-open"
							><span class="dot" aria-hidden="true"></span><span class="name">{category.name}</span><svg
								class="chevron"
								viewBox="0 0 24 24"
								aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
							></summary
						>
						<div class="body">
							<label
								>Name<input
									data-testid="Category-name"
									value={category.name}
									{disabled}
									onchange={(e) => {
										const name = e.currentTarget.value;
										save((routine) => updateCategory(routine, key, { name }));
									}}
								/></label
							>
							<fieldset {disabled}>
								<legend>Colour</legend>
								<div class="swatches">
									{#each CATEGORY_COLORS as color (color)}
										<input
											type="radio"
											class="swatch tone-{color}"
											name="color-{key}"
											value={color}
											aria-label={color[0].toUpperCase() + color.slice(1)}
											data-testid={`Category-color-${color}`}
											checked={category.color === color}
											onchange={() => save((routine) => updateCategory(routine, key, { color }))}
										/>
									{/each}
								</div>
							</fieldset>
							<button
								type="button"
								class="delete"
								data-testid="Category-delete"
								disabled={disabled || usedBy.length > 0}
								onclick={() => save((routine) => removeCategory(routine, key))}>Delete category</button
							>
							{#if usedBy.length}<p class="help" data-testid="Category-used-by">
									Used by {usedBy.slice(0, 3).join(', ')}{usedBy.length > 3
										? ` and ${usedBy.length - 3} more`
										: ''}. Change their category before deleting it.
								</p>{/if}
						</div>
					</details>
				</li>
			{/each}
		</ul>
	{/key}
	<button type="button" class="add" data-testid="Category-add" {disabled} onclick={add}>+ Add category</button
	>
	{#if saving}<p class="help" role="status">Saving…</p>{/if}
	{#if error}<p class="error" role="alert" data-testid="Category-error">{error}</p>{/if}
</section>

<style>
	.categories {
		margin-top: 1rem;
		padding: 1.25rem;
		background: var(--paper);
		border: 1px solid var(--rule);
		border-radius: var(--radius);
	}
	h2 {
		margin: 0;
		font-size: var(--text-md);
	}
	.help {
		margin: 0.35rem 0 0;
		color: var(--muted);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.error {
		color: var(--danger);
		font-size: var(--text-sm);
	}
	ul {
		list-style: none;
		margin: 0.75rem 0;
		padding: 0;
		border-top: 1px solid var(--rule);
	}
	li {
		border-bottom: 1px solid var(--rule);
	}
	summary {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 48px;
		list-style: none;
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 500;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.dot {
		flex: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--tone);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.chevron {
		flex: none;
		width: 18px;
		height: 18px;
		fill: none;
		stroke: var(--muted);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform 0.15s;
	}
	details[open] .chevron {
		transform: rotate(180deg);
	}
	.body {
		padding: 0 0 1rem;
	}
	label,
	legend {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}
	input:not([type='radio']) {
		padding: 0.7rem;
		background: var(--inset);
		color: var(--text);
		border: 1px solid var(--rule);
		border-radius: 10px;
		font: inherit;
		font-weight: 400;
	}
	fieldset {
		margin: 1rem 0 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	legend {
		margin-bottom: 0.5rem;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	/* A ring around the chosen colour, with a gap so it reads on every swatch. */
	.swatch {
		appearance: none;
		width: 36px;
		height: 36px;
		margin: 0;
		border: 2px solid transparent;
		border-radius: 50%;
		background: var(--tone) padding-box;
		box-shadow: inset 0 0 0 3px var(--paper);
		cursor: pointer;
	}
	.swatch:checked {
		border-color: var(--text);
	}
	.swatch:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	fieldset:disabled .swatch {
		opacity: 0.5;
		cursor: default;
	}
	.delete {
		margin-top: 1rem;
		padding: 0.5rem 0.9rem;
		border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--rule));
		background: color-mix(in srgb, var(--danger) 7%, transparent);
		color: var(--danger);
		font-size: var(--text-sm);
	}
	.delete:not(:disabled):hover {
		border-color: color-mix(in srgb, var(--danger) 65%, var(--rule));
		background: color-mix(in srgb, var(--danger) 13%, transparent);
	}
	.delete:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.add {
		width: 100%;
		border: 1px dashed var(--surface-hover);
		border-radius: 10px;
		background: transparent;
		color: var(--secondary);
		font-size: var(--text-sm);
	}
	.add:not(:disabled):hover {
		border-color: var(--secondary);
	}
	.add:disabled {
		opacity: 0.4;
	}
</style>
