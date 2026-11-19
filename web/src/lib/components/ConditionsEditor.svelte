<script lang="ts">
	import { WEEKDAYS, type Choice, type When, type Condition, type Weekday } from '#lib/routine/types.ts';
	import { weekdayLabel } from '#lib/routine/outline.ts';
	let {
		when = $bindable(),
		choices = {},
		open = $bindable(false)
	}: { when?: When; choices?: Record<string, Choice>; open?: boolean } = $props();
	function set(key: string, value: Condition | undefined) {
		const next = { ...when };
		if (value === undefined) delete next[key];
		else next[key] = value;
		when = Object.keys(next).length ? next : undefined;
	}
	function days(day: Weekday, enabled: boolean) {
		const selected = when?.days ?? [];
		set(
			'days',
			enabled
				? [...selected, day]
				: selected.filter((d) => d !== day).length
					? selected.filter((d) => d !== day)
					: undefined
		);
	}
	function options(key: string, value: string, enabled: boolean) {
		const old = when?.[key];
		const not = !!old && typeof old === 'object' && !Array.isArray(old);
		const selected =
			old === undefined
				? []
				: typeof old === 'object' && !Array.isArray(old)
					? [old.not].flat()
					: [old].flat();
		const next = enabled ? [...selected, value] : selected.filter((v) => v !== value);
		set(
			key,
			next.length
				? not
					? { not: next as string[] }
					: next.length === 1
						? (next[0] as string)
						: (next as string[])
				: undefined
		);
	}
	function selected(key: string, value: string) {
		const old = when?.[key];
		return (
			old !== undefined &&
			(typeof old === 'object' && !Array.isArray(old) ? [old.not].flat() : [old].flat()).includes(value)
		);
	}
</script>

<details bind:open class="conditions-editor" data-testid="ConditionsEditor">
	<summary data-testid="ConditionsEditor-open"
		><span class="summary-title">Available when{when ? ' · Conditional' : ''}</span><svg
			class="chevron"
			viewBox="0 0 24 24"
			aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
		></summary
	>
	<div class="condition-fields">
		<span class="field-label">Days</span>
		<div class="day-pills">
			{#each WEEKDAYS as day}<label class="day-pill"
					><input
						type="checkbox"
						checked={when?.days?.includes(day) ?? false}
						onchange={(e) => days(day, e.currentTarget.checked)}
					/>{weekdayLabel(day)}</label
				>{/each}
		</div>
		{#each Object.entries(choices) as [key, choice]}
			<div class="condition-choice" data-testid={`ConditionsEditor-${key}`}>
				{#if choice.type === 'toggle'}
					<label
						>{choice.label ?? key}<select
							data-testid="ConditionsEditor-value"
							value={when?.[key] === undefined ? 'any' : String(when[key])}
							onchange={(e) =>
								set(key, e.currentTarget.value === 'any' ? undefined : e.currentTarget.value === 'true')}
							><option value="any">Any</option><option value="true">On</option><option value="false"
								>Off</option
							></select
						></label
					>
				{:else}
					<span class="field-label">{choice.label ?? key}</span>
					{#each Object.entries(choice.options ?? {}) as [value, option]}<label class="check"
							><input
								data-testid={`ConditionsEditor-option-${value}`}
								type="checkbox"
								checked={selected(key, value)}
								onchange={(e) => options(key, value, e.currentTarget.checked)}
							/>{option.label ?? value}</label
						>{/each}
					<label class="check"
						><input
							type="checkbox"
							checked={!!when?.[key] && typeof when[key] === 'object' && !Array.isArray(when[key])}
							disabled={when?.[key] === undefined}
							onchange={(e) => {
								const old = when?.[key];
								if (old !== undefined) {
									const values =
										typeof old === 'object' && !Array.isArray(old)
											? [old.not].flat()
											: ([old].flat() as string[]);
									set(key, e.currentTarget.checked ? { not: values } : values);
								}
							}}
						/>Exclude selected options</label
					>
				{/if}
			</div>
		{/each}
	</div>
</details>
