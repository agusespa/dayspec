import { endTime, scheduleBlock } from './timing.ts';
/**
 * Turns the routine into one flat, time-ordered day: picks the day template, settles the
 * choices, expands blocks and keeps the entries whose `when` holds.
 */
import { dayMinutes, weekdayOf } from './date.ts';
import { getSwedishPublicHolidayName } from './swedish-holidays.ts';
import {
	DEFAULT_DAY_STARTS_AT,
	isGroup,
	isUse,
	type Category,
	type Choice,
	type ChoiceValue,
	type Entry,
	type ItemDef,
	type CategoryColor,
	type Routine,
	type UseEntry,
	type Weekday,
	type When
} from './types.ts';

export interface DayOverrides {
	choices?: Record<string, ChoiceValue>;
	holiday?: boolean;
}

export interface ResolvedOption {
	value: ChoiceValue;
	label: string;
}

export interface ResolvedChoice {
	name: string;
	label: string;
	type: 'select' | 'toggle';
	options: ResolvedOption[];
	value: ChoiceValue;
}

export interface ResolvedLink {
	label: string;
	url: string;
}

export interface SharedBlock {
	id: string;
	/** The block's key in `blocks`. */
	key: string;
	name: string;
	/** The block's own category colour; its items may differ. */
	color?: CategoryColor;
	categoryName?: string;
}

/** Where an item is defined: in a shared block, or else in the day's template, at this entry position. */
export interface ItemSource {
	block?: string;
	path: number[];
}

export interface ResolvedItem {
	sharedBlock?: SharedBlock;
	duration: number;
	/** Stable within a date as long as the item's time and title stay the same. */
	id: string;
	time?: string;
	end?: string;
	approx: boolean;
	title: string;
	/** The palette colour of the item's category; none when it has no category. */
	color?: CategoryColor;
	categoryName?: string;
	/** Why the item is in the day, e.g. "Location: Office" or "Tue"; empty when it always is. */
	conditions: string[];
	/** Where to edit the item; template previews leave it out. */
	source?: ItemSource;
	alert: boolean;
	links: ResolvedLink[];
	note?: string;
	/** Minutes on the day's clock used for ordering; untimed items take the previous item's. */
	sortKey: number;
}

export interface ResolvedDay {
	date: string;
	weekday: Weekday;
	template: string;
	theme?: string;
	holiday: boolean;
	/** Only the choices that apply to this day, in file order. */
	choices: ResolvedChoice[];
	items: ResolvedItem[];
}

export function humanize(id: string): string {
	const text = id.replace(/_/g, ' ');
	return text.charAt(0).toUpperCase() + text.slice(1);
}

export function dayStartsAt(routine: Routine): string {
	return routine.settings?.day_starts_at ?? DEFAULT_DAY_STARTS_AT;
}

export function templateFor(routine: Routine, weekday: Weekday, holiday: boolean): string {
	if (holiday) {
		const preferred = routine.settings?.holiday ?? '';
		if (routine.days[preferred]) return preferred;
	}
	const key = Object.keys(routine.days).find((k) => routine.days[k].on.includes(weekday));
	return key ?? '';
}

export function matches(
	when: When | undefined,
	values: Record<string, ChoiceValue>,
	weekday: Weekday
): boolean {
	if (!when) return true;
	for (const [key, cond] of Object.entries(when)) {
		if (cond === undefined) continue;
		if (key === 'days') {
			if (!(cond as Weekday[]).includes(weekday)) return false;
			continue;
		}
		const value = values[key];
		if (Array.isArray(cond)) {
			if (value === undefined || !(cond as string[]).includes(value as string)) return false;
		} else if (typeof cond === 'object') {
			// `not` also holds when the choice doesn't apply today.
			const excluded = Array.isArray(cond.not) ? cond.not : [cond.not];
			if (value !== undefined && excluded.includes(value as string)) return false;
		} else if (value !== cond) {
			return false;
		}
	}
	return true;
}

function resolveChoices(
	routine: Routine,
	template: string,
	weekday: Weekday,
	overrides: Record<string, ChoiceValue>
): { values: Record<string, ChoiceValue>; choices: ResolvedChoice[] } {
	const values: Record<string, ChoiceValue> = {};
	const choices: ResolvedChoice[] = [];
	for (const [name, choice] of Object.entries(routine.days[template].choices ?? {})) {
		if (!matches(choice.active_when, values, weekday)) continue;
		const type = choice.type ?? 'select';
		const options: ResolvedOption[] =
			type === 'toggle'
				? [
						{ value: false, label: 'Off' },
						{ value: true, label: 'On' }
					]
				: Object.entries(choice.options ?? {})
						.filter(([, o]) => !o.only_on || o.only_on.includes(weekday))
						.map(([value, o]) => ({ value, label: o.label ?? humanize(value) }));
		if (!options.length) continue;
		const allowed = (v: ChoiceValue | undefined) => v !== undefined && options.some((o) => o.value === v);
		const fallback = typeof choice.default === 'object' ? choice.default[weekday] : choice.default;
		const value = allowed(overrides[name])
			? overrides[name]
			: allowed(fallback)
				? (fallback as ChoiceValue)
				: options[0].value;
		values[name] = value;
		choices.push({ name, label: choice.label ?? humanize(name), type, options, value });
	}
	return { values, choices };
}

interface Context {
	routine: Routine;
	values: Record<string, ChoiceValue>;
	weekday: Weekday;
	/** The template's choices, for describing conditions with their labels. */
	choices: Record<string, Choice>;
}

/** Expands groups and blocks into the item definitions whose `when` holds, in file order. */
type CollectedItem = ItemDef & { sharedBlock?: SharedBlock; whens: When[]; source: ItemSource };

/** Items without a category take the one of the block they sit in. */
export function withCategory(item: ItemDef, inherited: string | undefined): ItemDef {
	return inherited && !item.category ? { ...item, category: inherited } : item;
}

/** Where `collect` is in the routine: what the entries inherit and where they're defined. */
interface Scope {
	/** Stable location of the occurrence, used for block group IDs. */
	location: string;
	category?: string;
	whens: When[];
	source: ItemSource;
}

function collect(entries: Entry[], ctx: Context, scope: Scope): CollectedItem[] {
	const out: CollectedItem[] = [];
	for (const [index, entry] of entries.entries()) {
		const location = `${scope.location}/${index}`;
		if (!matches(entry.when, ctx.values, ctx.weekday)) continue;
		const whens = entry.when ? [...scope.whens, entry.when] : scope.whens;
		const source = { ...scope.source, path: [...scope.source.path, index] };
		if (isGroup(entry)) {
			out.push(...collect(entry.items, ctx, { ...scope, location, whens, source }));
		} else if (isUse(entry)) {
			const block = ctx.routine.blocks?.[entry.use];
			if (!block) throw new Error(`Unknown block "${entry.use}"`);
			const sharedBlock = {
				id: location,
				key: entry.use,
				name: block.name,
				color: categoryColor(ctx.routine, block.category),
				categoryName: categoryOf(ctx.routine, block.category)?.name
			};
			const inner = collect(block.items, ctx, {
				location,
				category: block.category ?? scope.category,
				whens,
				source: { block: entry.use, path: [] }
			});
			out.push(...scheduleBlock(inner, entry.time).map((item) => ({ ...item, sharedBlock })));
		} else {
			out.push({ ...withCategory(entry, scope.category), whens, source });
		}
	}
	return out;
}

export function slug(text: string): string {
	return text
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function categoryOf(routine: Routine, key: string | undefined): Category | undefined {
	return key && routine.categories && Object.hasOwn(routine.categories, key)
		? routine.categories[key]
		: undefined;
}

export function categoryColor(routine: Routine, key: string | undefined): CategoryColor | undefined {
	return categoryOf(routine, key)?.color;
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

export function resolveLinks(link: string | string[] | undefined, _routine?: Routine): ResolvedLink[] {
	if (!link) return [];
	return (Array.isArray(link) ? link : [link]).map((url) => ({ label: new URL(url).hostname, url }));
}

function toResolved(def: CollectedItem, ctx: Context, used: Set<string>, sortKey: number): ResolvedItem {
	const base = `${def.time ?? ''}-${slug(def.title)}`;
	let id = base;
	for (let n = 2; used.has(id); n++) id = `${base}~${n}`;
	used.add(id);
	return {
		id,
		sharedBlock: def.sharedBlock,
		time: def.time,
		end: endTime(def),
		duration: def.duration,
		approx: def.approx ?? false,
		title: def.title,
		color: categoryColor(ctx.routine, def.category),
		categoryName: categoryOf(ctx.routine, def.category)?.name,
		conditions: def.whens.flatMap((when) => describeWhen(when, ctx.choices)),
		source: def.source,
		alert: def.alert ?? false,
		links: resolveLinks(def.link, ctx.routine),
		note: def.note,
		sortKey
	};
}

export function resolveDay(routine: Routine, date: string, overrides: DayOverrides = {}): ResolvedDay {
	const weekday = weekdayOf(date);
	const holiday =
		overrides.holiday ??
		(routine.settings?.automatic_swedish_holidays !== false &&
			getSwedishPublicHolidayName(date) !== undefined);
	const template = templateFor(routine, weekday, holiday);
	if (!template) return { date, weekday, template: '', holiday, choices: [], items: [] };
	const { values, choices } = resolveChoices(routine, template, weekday, overrides.choices ?? {});
	const ctx: Context = { routine, values, weekday, choices: routine.days[template].choices ?? {} };
	const start = dayStartsAt(routine);

	const used = new Set<string>();
	let previous = -1;
	const items = collect(routine.days[template].items, ctx, {
		location: 'root',
		whens: [],
		source: { path: [] }
	}).map((def) => {
		const key = def.time ? dayMinutes(def.time, start) : previous;
		previous = key;
		return toResolved(def, ctx, used, key);
	});
	// Array.prototype.sort is stable, so equal times keep their file order.
	items.sort((a, b) => a.sortKey - b.sortKey);

	return { date, weekday, template, theme: routine.days[template].theme, holiday, choices, items };
}

/**
 * The item happening at `now` (minutes on the day's clock): the last one that has started, or
 * the first one when nothing has started yet. -1 for an empty day.
 */
export function currentIndex(items: ResolvedItem[], now: number): { index: number; upcoming: boolean } {
	if (items.length === 0) return { index: -1, upcoming: false };
	let index = -1;
	items.forEach((item, i) => {
		if (item.sortKey <= now) index = i;
	});
	return index < 0 ? { index: 0, upcoming: true } : { index, upcoming: false };
}
