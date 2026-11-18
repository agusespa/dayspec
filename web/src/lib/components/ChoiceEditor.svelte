<script lang="ts">
	import { type Routine, type Choice, type Weekday } from '#lib/routine/types.ts';
	import {
		addChoice,
		removeChoice,
		changeChoiceType,
		removeOption,
		setChoiceDefault,
		setChoiceDefaultMode
	} from '#lib/routine/choices.ts';
	import ConditionsEditor from './ConditionsEditor.svelte';
	import { weekdayLabel } from '#lib/routine/outline.ts';
	let { routine = $bindable(), template }: { routine: Routine; template: string } = $props();
	let error = $state('');
	function apply(change: () => Routine) {
		try {
			routine = change();
			error = '';
		} catch (cause) {
			error = (cause as Error).message;
		}
	}
	function addOption(choice: Choice) {
		const options = (choice.options ??= {});
		let key = 'option';
		for (let n = 2; Object.hasOwn(options, key); n++) key = `option_${n}`;
		options[key] = { label: 'New option' };
	}
	function updateDefault(name: string, choice: Choice, value: string, day?: Weekday) {
		routine.days[template].choices![name] = setChoiceDefault(
			choice,
			choice.type === 'toggle' ? value === 'true' : value,
			day
		);
	}
</script>

<section class="choice-editor" data-testid="ChoiceEditor">
	<h2>Choices</h2>
	{#each Object.entries(routine.days[template].choices ?? {}) as [name, choice], index}
		<details class="entry" data-testid={`ChoiceEditor-${name}`}>
			<summary data-testid="ChoiceEditor-open"
				><span class="summary-title">{choice.label ?? name}</span><span class="badge"
					>{choice.type === 'toggle' ? 'On / off' : 'Options'}</span
				><svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary
			>
			<div class="entry-body">
				<label
					>Name<input
						data-testid="ChoiceEditor-name"
						value={choice.label ?? name}
						oninput={(e) => (choice.label = e.currentTarget.value)}
					/></label
				>
				<label
					>Type<select
						data-testid="ChoiceEditor-type"
						value={choice.type ?? 'select'}
						onchange={(e) => {
							const input = e.currentTarget;
							apply(() =>
								changeChoiceType($state.snapshot(routine), template, name, input.value as 'select' | 'toggle')
							);
							input.value = routine.days[template].choices![name].type ?? 'select';
						}}><option value="select">Selection</option><option value="toggle">Toggle</option></select
					></label
				>
				{#if choice.type !== 'toggle'}
					<span class="field-label">Options</span>
					{#each Object.entries(choice.options ?? {}) as [value, option]}
						<div class="choice-option" data-testid={`ChoiceEditor-option-${value}`}>
							<label
								>Name<input
									data-testid="ChoiceEditor-option-name"
									value={option.label ?? value}
									oninput={(e) => (option.label = e.currentTarget.value)}
								/></label
							><button
								type="button"
								class="danger"
								data-testid="ChoiceEditor-option-remove"
								onclick={() => apply(() => removeOption($state.snapshot(routine), template, name, value))}
								>Remove</button
							>
						</div>
					{/each}
					<button
						type="button"
						class="add"
						data-testid="ChoiceEditor-add-option"
						onclick={() => addOption(choice)}>+ Add option</button
					>
				{/if}
				<label
					>Defaults<select
						data-testid="ChoiceEditor-default-mode"
						value={typeof choice.default === 'object' ? 'weekday' : 'same'}
						onchange={(e) => {
							const input = e.currentTarget;
							apply(() => {
								const next = $state.snapshot(routine);
								next.days[template].choices![name] = setChoiceDefaultMode(
									choice,
									next.days[template].on,
									input.value === 'weekday'
								);
								return next;
							});
							input.value =
								typeof routine.days[template].choices![name].default === 'object' ? 'weekday' : 'same';
						}}><option value="same">Same every day</option><option value="weekday">By weekday</option></select
					></label
				>
				{#each typeof choice.default === 'object' ? routine.days[template].on : [undefined] as day}
					<label
						>Default{day ? ` · ${weekdayLabel(day)}` : ''}<select
							data-testid="ChoiceEditor-default"
							aria-label={day ? `Default · ${weekdayLabel(day)}` : 'Default'}
							value={String(day && typeof choice.default === 'object' ? choice.default[day] : choice.default)}
							onchange={(e) => updateDefault(name, choice, e.currentTarget.value, day)}
						>
							{#if choice.type === 'toggle'}<option value="true">On</option><option value="false">Off</option
								>{:else}{#each Object.entries(choice.options ?? {}).filter(([, o]) => !o.only_on || (day ? o.only_on.includes(day) : routine.days[template].on.every( (d) => o.only_on!.includes(d) ))) as [value, option]}<option
										{value}>{option.label ?? value}</option
									>{/each}{/if}
						</select></label
					>
				{/each}
				<ConditionsEditor
					bind:when={choice.active_when}
					choices={Object.fromEntries(Object.entries(routine.days[template].choices ?? {}).slice(0, index))}
				/>
				<button
					type="button"
					class="danger"
					data-testid="ChoiceEditor-remove"
					onclick={() => apply(() => removeChoice($state.snapshot(routine), template, name))}
					>Remove choice</button
				>
			</div>
		</details>
	{/each}
	<button
		type="button"
		class="add"
		data-testid="ChoiceEditor-add"
		onclick={() => apply(() => addChoice($state.snapshot(routine), template))}>+ Add choice</button
	>
	{#if error}<p role="alert" data-testid="ChoiceEditor-error">{error}</p>{/if}
</section>
