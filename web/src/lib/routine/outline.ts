import { endTime, scheduleBlock } from './timing.ts';
import { templateName } from './edit.ts';
/**
 * One day template as a whole, for the Templates view: every activity in every explicit path,
 * and each alternative with its weekday defaults.
 */
import { dayMinutes } from './date.ts';
import {
	categoryColor,
	categoryOf,
	dayStartsAt,
	humanize,
	resolveLink,
	withCategory,
	slug,
	type ResolvedItem,
	type SharedBlock
} from './resolve.ts';

export { weekdayLabel } from './resolve.ts';
import {
	isBranch,
	isUse,
	type Choice,
	type Entry,
	type SharedEntry,
	type Activity,
	type Routine,
	type Weekday
} from './types.ts';

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

interface Placed {
	sharedBlock?: SharedBlock;
	def: Activity & { time?: string; approx?: boolean };
}

/** Expand every saved path for the template library. */
function placeAll(
	entries: (Entry | SharedEntry)[],
	routine: Routine,
	path = 'root',
	inherited?: string
): Placed[] {
	const out: Placed[] = [];
	for (const [index, entry] of entries.entries()) {
		const location = `${path}/${index}`;
		if (isBranch(entry)) {
			out.push(
				...Object.entries(entry.paths).flatMap(([option, items]) =>
					placeAll(items, routine, `${location}/${option}`, inherited)
				)
			);
		} else if (isUse(entry)) {
			const block = routine.blocks?.[entry.use];
			if (!block) throw new Error(`Unknown block "${entry.use}"`);
			const placed = placeAll(block.items, routine, location, block.category ?? inherited);
			const scheduled = scheduleBlock(
				placed.map((item) => item.def),
				'time' in entry ? entry.time : undefined
			);
			out.push(
				...placed.map((item, i) => ({
					...item,
					def: scheduled[i],
					sharedBlock: {
						id: location,
						key: entry.use,
						name: block.name,
						color: categoryColor(routine, block.category),
						categoryName: categoryOf(routine, block.category)?.name
					}
				}))
			);
		} else {
			out.push({ def: withCategory(entry, inherited) });
		}
	}
	return out;
}

function toOutline(
	{ def, sharedBlock }: Placed,
	routine: Routine,
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
		color: categoryColor(routine, def.category),
		categoryName: categoryOf(routine, def.category)?.name,
		alert: def.alert ?? false,
		link: resolveLink(def.link),
		note: def.note,

		sortKey
	};
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
	const defaults = on.map((day) => {
		const offered = values.filter((v) => !v.onlyOn || v.onlyOn.includes(day));
		const wanted = typeof choice.default === 'object' ? choice.default[day] : choice.default;
		return offered.some((v) => v.value === wanted) ? wanted : offered[0]?.value;
	});
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

/** Outline all paths without changing the saved library. */
export function outlineDay(routine: Routine, key: string): OutlineDay {
	const template = routine.days[key];
	const choices = template.choices ?? {};
	const start = dayStartsAt(routine);
	const used = new Set<string>();
	let previous = -1;
	const items = placeAll(template.items, routine).map((placed) => {
		const sortKey = placed.def.time ? dayMinutes(placed.def.time, start) : previous;
		previous = sortKey;
		return toOutline(placed, routine, used, sortKey);
	});
	items.sort((a, b) => a.sortKey - b.sortKey);
	return {
		key,
		label: templateName(template.on),
		on: template.on,
		theme: template.theme,
		choices: Object.entries(choices).map(([name, c]) => outlineChoice(name, c, template.on)),
		items
	};
}
