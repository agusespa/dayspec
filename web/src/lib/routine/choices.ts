import type { Choice, ChoiceValue, Entry, Routine, When, Weekday } from './types.ts';
import { cloneRoutine } from './edit.ts';

export function choiceUsed(routine: Routine, template: string, name: string, option?: string): boolean {
	const matches = (when: When | undefined) => {
		const value = when?.[name];
		if (value === undefined) return false;
		if (option === undefined) return true;
		if (typeof value === 'object' && !Array.isArray(value)) return [value.not].flat().includes(option);
		return [value].flat().includes(option);
	};
	const walk = (entries: Entry[], stack: string[] = []): boolean =>
		entries.some(
			(entry) =>
				matches(entry.when) ||
				('items' in entry && walk(entry.items, stack)) ||
				('use' in entry &&
					!stack.includes(entry.use) &&
					walk(routine.blocks?.[entry.use]?.items ?? [], [...stack, entry.use]))
		);
	return (
		walk(routine.days[template].items) ||
		Object.values(routine.days[template].choices ?? {}).some((choice) => matches(choice.active_when))
	);
}

export function addChoice(routine: Routine, template: string): Routine {
	const next = cloneRoutine(routine);
	const choices = (next.days[template].choices ??= {});
	let key = 'choice';
	for (let n = 2; Object.hasOwn(choices, key); n++) key = `choice_${n}`;
	choices[key] = {
		label: 'New choice',
		type: 'select',
		options: { option: { label: 'Option 1' }, option_2: { label: 'Option 2' } },
		default: 'option'
	};
	return next;
}

export function removeChoice(routine: Routine, template: string, name: string): Routine {
	if (choiceUsed(routine, template, name)) throw new Error('Remove the conditions using this choice first.');
	const next = cloneRoutine(routine);
	delete next.days[template].choices?.[name];
	return next;
}

export function changeChoiceType(
	routine: Routine,
	template: string,
	name: string,
	type: 'toggle' | 'select'
): Routine {
	if (choiceUsed(routine, template, name))
		throw new Error('Remove the conditions using this choice before changing its type.');
	const next = cloneRoutine(routine);
	const choice = next.days[template].choices![name];
	choice.type = type;
	if (type === 'toggle') {
		delete choice.options;
		choice.default = false;
	} else {
		choice.options = { option: { label: 'Option 1' }, option_2: { label: 'Option 2' } };
		choice.default = 'option';
	}
	return next;
}

export function removeOption(routine: Routine, template: string, name: string, option: string): Routine {
	const choice = routine.days[template].choices![name];
	if (Object.keys(choice.options ?? {}).length <= 2)
		throw new Error('A selection needs at least two options.');
	const defaults = typeof choice.default === 'object' ? Object.values(choice.default) : [choice.default];
	if (defaults.includes(option) || choiceUsed(routine, template, name, option))
		throw new Error('Change defaults and conditions using this option first.');
	const next = cloneRoutine(routine);
	delete next.days[template].choices![name].options?.[option];
	return next;
}

export function setChoiceDefault(choice: Choice, value: ChoiceValue, weekday?: string): Choice {
	return {
		...choice,
		default: weekday
			? { ...(typeof choice.default === 'object' ? choice.default : {}), [weekday]: value }
			: value
	};
}

/** Change how defaults are assigned without changing option IDs or daily overrides. */
export function setChoiceDefaultMode(choice: Choice, days: readonly Weekday[], byWeekday: boolean): Choice {
	const values: ChoiceValue[] = choice.type === 'toggle' ? [false, true] : Object.keys(choice.options ?? {});
	const allowed = (value: ChoiceValue, day: Weekday) => {
		const restricted = choice.options?.[String(value)]?.only_on;
		return values.includes(value) && (!restricted || restricted.includes(day));
	};
	const current = (day: Weekday) =>
		typeof choice.default === 'object' ? choice.default[day] : choice.default;
	if (byWeekday) {
		const defaults = Object.fromEntries(
			days.map((day) => {
				const previous = current(day);
				const value =
					previous !== undefined && allowed(previous, day)
						? previous
						: values.find((value) => allowed(value, day));
				if (value === undefined) throw new Error(`No option is available on ${day}.`);
				return [day, value];
			})
		);
		return { ...choice, default: defaults };
	}
	const previous = days.length ? current(days[0]) : undefined;
	const value =
		previous !== undefined && days.every((day) => allowed(previous, day))
			? previous
			: values.find((value) => days.every((day) => allowed(value, day)));
	if (value === undefined)
		throw new Error('No option is available on every assigned day. Use weekday defaults.');
	return { ...choice, default: value };
}
