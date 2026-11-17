import { endTime, scheduleBlock } from './timing.ts';
import { templateName } from './edit.ts';
/**
 * One day template as a whole, for the Templates view: every item of every variant, each labelled
 * with the conditions under which it shows, and every choice with its defaults per weekday.
 */
import { dayMinutes } from './date.ts';
import { dayStartsAt, humanize, resolveLinks, slug, type ResolvedItem, type SharedBlock } from './resolve.ts';
import {
	isGroup,
	isUse,
	type Choice,
	type ChoiceValue,
	type Entry,
	type ItemDef,
	type Routine,
	type Weekday,
	type When
} from './types.ts';

export interface OutlineItem extends ResolvedItem {
	/** When the item shows, e.g. "Location: Office" or "Tue"; empty when it always does. */
	conditions: string[];
}

export interface OutlineOption {
	label: string;
	/** The weekdays this option is the default on. */
	defaultOn: Weekday[];
	onlyOn?: Weekday[];
}

export interface OutlineChoice {
	name: string;
	label: string;
	type: 'select' | 'toggle';
	options: OutlineOption[];
	/** When the choice applies at all; empty when it always does. */
	activeWhen: string[];
}

export interface OutlineDay {
	key: string;
	label: string;
	on: Weekday[];
	theme?: string;
	choices: OutlineChoice[];
	items: OutlineItem[];
}

export function weekdayLabel(day: Weekday): string {
	return day.charAt(0).toUpperCase() + day.slice(1);
}

/** A `when` as short labels, using the template's own choice and option labels. */
export function describeWhen(when: When | undefined, choices: Record<string, Choice>): string[] {
	if (!when) return [];
	return Object.entries(when).flatMap(([key, cond]) => {
		if (cond === undefined) return [];
		if (key === 'days') return [(cond as Weekday[]).map(weekdayLabel).join(', ')];
		const choice = choices[key];
		const label = choice?.label ?? humanize(key);
		if (typeof cond === 'boolean') return [`${label} ${cond ? 'on' : 'off'}`];
		const option = (value: string) => choice?.options?.[value]?.label ?? humanize(value);
		if (typeof cond === 'string') return [`${label}: ${option(cond)}`];
		if (Array.isArray(cond)) return [`${label}: ${cond.map(option).join(' or ')}`];
		const excluded = Array.isArray(cond.not) ? cond.not : [cond.not];
		return [`${label}: not ${excluded.map(option).join(' or ')}`];
	});
}

interface Placed {
	sharedBlock?: SharedBlock;
	def: ItemDef;
	whens: When[];
}

/** Like the resolver's collect, but keeps every entry and the `when`s it sits under. */
function placeAll(entries: Entry[], routine: Routine, outer: When[], path = 'root'): Placed[] {
	const out: Placed[] = [];
	for (const [index, entry] of entries.entries()) {
		const location = `${path}/${index}`;
		const whens = entry.when ? [...outer, entry.when] : outer;
		if (isGroup(entry)) {
			out.push(...placeAll(entry.items, routine, whens, location));
		} else if (isUse(entry)) {
			const block = routine.blocks?.[entry.use];
			if (!block) throw new Error(`Unknown block "${entry.use}"`);
			const placed = placeAll(block.items, routine, whens, location);
			const scheduled = scheduleBlock(
				placed.map((item) => item.def),
				entry.time
			);
			out.push(
				...placed.map((item, i) => ({
					...item,
					def: scheduled[i],
					sharedBlock: { id: location, name: block.name }
				}))
			);
		} else {
			out.push({ def: entry, whens });
		}
	}
	return out;
}

function toOutline(
	{ def, whens, sharedBlock }: Placed,
	routine: Routine,
	choices: Record<string, Choice>,
	used: Set<string>,
	sortKey: number
): OutlineItem {
	const base = `${def.time ?? ''}-${slug(def.title)}`;
	let id = base;
	for (let n = 2; used.has(id); n++) id = `${base}~${n}`;
	used.add(id);
	return {
		id,
		sharedBlock,
		time: def.time,
		end: endTime(def),
		duration: def.duration,
		approx: def.approx ?? false,
		title: def.title,
		kind: def.kind,
		alert: def.alert ?? false,
		links: resolveLinks(def.link, routine),
		note: def.note,
		conditions: whens.flatMap((w) => describeWhen(w, choices)),
		sortKey
	};
}

function outlineChoice(
	name: string,
	choice: Choice,
	on: Weekday[],
	choices: Record<string, Choice>
): OutlineChoice {
	const type = choice.type ?? 'select';
	const values: { value: ChoiceValue; label: string; onlyOn?: Weekday[] }[] =
		type === 'toggle'
			? [
					{ value: true, label: 'On' },
					{ value: false, label: 'Off' }
				]
			: Object.entries(choice.options ?? {}).map(([value, o]) => ({
					value,
					label: o.label ?? humanize(value),
					onlyOn: o.only_on
				}));
	// The default each weekday ends up with, as the resolver settles it.
	const defaults = on.map((day) => {
		const offered = values.filter((v) => !v.onlyOn || v.onlyOn.includes(day));
		const wanted = typeof choice.default === 'object' ? choice.default[day] : choice.default;
		return offered.some((v) => v.value === wanted) ? wanted : offered[0]?.value;
	});
	return {
		name,
		label: choice.label ?? humanize(name),
		type,
		options: values.map((v) => ({
			label: v.label,
			defaultOn: on.filter((_, i) => defaults[i] === v.value),
			onlyOn: v.onlyOn
		})),
		activeWhen: describeWhen(choice.active_when, choices)
	};
}

export function outlineDay(routine: Routine, key: string): OutlineDay {
	const template = routine.days[key];
	const choices = template.choices ?? {};
	const start = dayStartsAt(routine);
	const used = new Set<string>();
	let previous = -1;
	const items = placeAll(template.items, routine, []).map((placed) => {
		const sortKey = placed.def.time ? dayMinutes(placed.def.time, start) : previous;
		previous = sortKey;
		return toOutline(placed, routine, choices, used, sortKey);
	});
	items.sort((a, b) => a.sortKey - b.sortKey);
	return {
		key,
		label: templateName(template.on),
		on: template.on,
		theme: template.theme,
		choices: Object.entries(choices).map(([name, c]) => outlineChoice(name, c, template.on, choices)),
		items
	};
}
