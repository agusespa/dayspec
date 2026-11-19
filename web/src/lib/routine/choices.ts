import { isBranch, type Choice, type ChoiceValue, type Entry, type Routine, type Weekday } from './types.ts';
import { cloneRoutine } from './edit.ts';

export function choiceUsed(routine: Routine, template: string, name: string, option?: string): boolean {
	const walk = (entries: Entry[]): boolean =>
		entries.some(
			(entry) =>
				isBranch(entry) &&
				((entry.alternative === name && (option === undefined || (entry.paths[option]?.length ?? 0) > 0)) ||
					Object.values(entry.paths).some(walk))
		);
	return walk(routine.days[template].items);
}

export function addChoice(routine: Routine, template: string): Routine {
	const next = cloneRoutine(routine);
	const choices = (next.days[template].choices ??= {});
	let key = 'choice';
	for (let n = 2; Object.hasOwn(choices, key); n++) key = `choice_${n}`;
	choices[key] = {
		label: 'New alternative',
		options: { option: { label: 'Option 1' }, option_2: { label: 'Option 2' } },
		default: 'option'
	};
	return next;
}

export function removeChoice(routine: Routine, template: string, name: string): Routine {
	if (choiceUsed(routine, template, name)) throw new Error('Remove the forks using this alternative first.');
	const next = cloneRoutine(routine);
	delete next.days[template].choices?.[name];
	return next;
}

export function removeOption(routine: Routine, template: string, name: string, option: string): Routine {
	const choice = routine.days[template].choices![name];
	if (Object.keys(choice.options ?? {}).length <= 2)
		throw new Error('A selection needs at least two options.');
	const defaults = typeof choice.default === 'object' ? Object.values(choice.default) : [choice.default];
	if (defaults.includes(option) || choiceUsed(routine, template, name, option))
		throw new Error('Change defaults and empty the paths using this option first.');
	const next = cloneRoutine(routine);
	delete next.days[template].choices![name].options[option];
	const clean = (entries: Entry[]) => {
		for (const entry of entries)
			if (isBranch(entry)) {
				if (entry.alternative === name) delete entry.paths[option];
				Object.values(entry.paths).forEach(clean);
			}
	};
	clean(next.days[template].items);
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
	const values: ChoiceValue[] = Object.keys(choice.options);
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
