/** The template library shows every fork path and the defaults for each weekday. */
import { templateName } from './edit.ts';
import { humanize, resolveChoice, resolveEntries, type ResolvedItem } from './resolve.ts';
export { weekdayLabel } from './resolve.ts';
import type { Choice, DayTemplate, Routine, Weekday } from './types.ts';

export type OutlineItem = ResolvedItem;

export interface OutlineOption {
	label: string;
	/** The weekdays this option is the default on. */
	defaultOn: Weekday[];
	onlyOn?: Weekday[];
}

export interface OutlineChoice {
	name: string;
	label: string;
	options: OutlineOption[];
}

export interface OutlineDay {
	key: string;
	label: string;
	on: Weekday[];
	theme?: string;
	choices: OutlineChoice[];
	items: OutlineItem[];
}

function outlineChoice(name: string, choice: Choice, on: Weekday[]): OutlineChoice {
	const values: { value: string; label: string; onlyOn?: Weekday[] }[] = Object.entries(choice.options).map(
		([value, o]) => ({
			value,
			label: o.label ?? humanize(value),
			onlyOn: o.only_on
		})
	);
	// The default each weekday ends up with, as the resolver settles it.
	const defaults = on.map((day) => resolveChoice(name, choice, day)?.value);
	return {
		name,
		label: choice.label ?? humanize(name),
		options: values.map((v) => ({
			label: v.label,
			defaultOn: on.filter((_, i) => defaults[i] === v.value),
			onlyOn: v.onlyOn
		}))
	};
}

/** Choice metadata does not require expanding the template's activities. */
export function outlineChoices(template: DayTemplate): OutlineChoice[] {
	return Object.entries(template.choices ?? {}).map(([name, choice]) =>
		outlineChoice(name, choice, template.on)
	);
}

/** Outline all paths without changing the saved library. */
export function outlineDay(routine: Routine, key: string): OutlineDay {
	const template = routine.templates[key];
	return {
		key,
		label: templateName(template.on),
		on: template.on,
		theme: template.theme,
		choices: outlineChoices(template),
		items: resolveEntries(template.items, routine, template.choices)
	};
}
