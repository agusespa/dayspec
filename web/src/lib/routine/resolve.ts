import { endTime, scheduleBlock } from './timing.ts';
/**
 * Turns the routine into one flat, time-ordered day: picks the day template, settles the
 * options, follows their fork paths and expands shared blocks.
 */
import { dayMinutes, weekdayOf } from './date.ts';
import { getSwedishPublicHolidayName } from './swedish-holidays.ts';
import {
	DEFAULT_DAY_STARTS_AT,
	isBranch,
	isUse,
	type Category,
	type Choice,
	type ChoiceValue,
	type Entry,
	type Branch,
	type SharedEntry,
	type Activity,
	type CategoryColor,
	type Routine,
	type Weekday
} from './types.ts';

export interface DayOverrides {
	choices?: Record<string, Record<string, ChoiceValue>>;
	holiday?: boolean;
}

export interface ResolvedOption {
	value: ChoiceValue;
	label: string;
}

export interface ResolvedChoice {
	name: string;
	label: string;
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
	/** Where to edit the item; template previews leave it out. */
	source?: ItemSource;
	alert: boolean;
	link?: ResolvedLink;
	note?: string;
	/** Minutes on the day's clock used for ordering; incomplete editor drafts follow the previous activity. */
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
		const preferred = routine.settings?.holiday_template ?? '';
		if (routine.templates[preferred]) return preferred;
	}
	const key = Object.keys(routine.templates).find((k) => routine.templates[k].on.includes(weekday));
	return key ?? '';
}

export function resolveChoice(
	name: string,
	choice: Choice,
	weekday: Weekday,
	override?: ChoiceValue
): ResolvedChoice | undefined {
	const options = Object.entries(choice.options)
		.filter(([, option]) => !option.only_on || option.only_on.includes(weekday))
		.map(([value, option]) => ({ value, label: option.label ?? humanize(value) }));
	if (!options.length) return undefined;
	const allowed = (value: ChoiceValue | undefined) => options.some((option) => option.value === value);
	const fallback = typeof choice.default === 'object' ? choice.default[weekday] : choice.default;
	const value = allowed(override) ? override! : allowed(fallback) ? fallback! : options[0].value;
	return { name, label: choice.label ?? humanize(name), options, value };
}

interface Context {
	routine: Routine;
	choices: Record<string, Choice>;
	/** Omit for a preview of every path; Daily returns just the selected option. */
	selectPath?: (branch: Branch) => string | undefined;
}

/** Follow selected fork paths and expand shared blocks. */
type CollectedItem = Activity & { time?: string; approx?: boolean } & {
	sharedBlock?: SharedBlock;
	source: ItemSource;
};

/** Items without a category take the one of the block they sit in. */
export function withCategory<T extends Activity>(item: T, inherited: string | undefined): T {
	return inherited && !item.category ? { ...item, category: inherited } : item;
}

/** The current path, inherited category, and editable source. */
interface Scope {
	/** Stable location of the occurrence, used for block group IDs. */
	location: string;
	category?: string;
	source: ItemSource;
}

function collect(entries: (Entry | SharedEntry)[], ctx: Context, scope: Scope): CollectedItem[] {
	const out: CollectedItem[] = [];
	for (const [index, entry] of entries.entries()) {
		const location = `${scope.location}/${index}`;
		const source = { ...scope.source, path: [...scope.source.path, index] };
		if (isBranch(entry)) {
			const options = ctx.selectPath ? [ctx.selectPath(entry)] : Object.keys(entry.paths);
			for (const option of options) {
				if (option === undefined) continue;
				const optionIndex = Object.keys(ctx.choices[entry.choice]?.options ?? entry.paths).indexOf(option);
				out.push(
					...collect(entry.paths[option] ?? [], ctx, {
						...scope,
						location: `${location}/${option}`,
						source: { ...source, path: [...source.path, optionIndex] }
					})
				);
			}
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
				source: { block: entry.use, path: [] }
			});
			const approx = 'approx' in entry && entry.approx;
			out.push(
				...scheduleBlock(inner, 'time' in entry ? entry.time : undefined).map((item) => ({
					...item,
					...(approx ? { approx: true } : {}),
					sharedBlock
				}))
			);
		} else {
			out.push({ ...withCategory(entry, scope.category), source });
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

export function resolveLink(link: string | undefined): ResolvedLink | undefined {
	return link ? { label: new URL(link).hostname, url: link } : undefined;
}

function toResolved(
	def: CollectedItem,
	routine: Routine,
	used: Set<string>,
	sortKey: number,
	sources: boolean
): ResolvedItem {
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
		color: categoryColor(routine, def.category),
		categoryName: categoryOf(routine, def.category)?.name,
		...(sources ? { source: def.source } : {}),
		alert: def.alert ?? false,
		link: resolveLink(def.link),
		note: def.note,
		sortKey
	};
}

/** Resolve activity details and shared-block times identically in Daily and template previews. */
export function resolveEntries(
	entries: Entry[],
	routine: Routine,
	choices: Record<string, Choice> = {},
	selectPath?: (branch: Branch) => string | undefined
): ResolvedItem[] {
	const ctx: Context = { routine, choices, selectPath };
	const used = new Set<string>();
	let previous = -1;
	const items = collect(entries, ctx, { location: 'root', source: { path: [] } }).map((def) => {
		const key = def.time ? dayMinutes(def.time, dayStartsAt(routine)) : previous;
		previous = key;
		return toResolved(def, routine, used, key, !!selectPath);
	});
	// Stable sorting keeps equal start times in their saved order.
	return items.sort((a, b) => a.sortKey - b.sortKey);
}

export function resolveDay(routine: Routine, date: string, overrides: DayOverrides = {}): ResolvedDay {
	const weekday = weekdayOf(date);
	const holiday =
		overrides.holiday ??
		(routine.settings?.automatic_swedish_holidays !== false &&
			getSwedishPublicHolidayName(date) !== undefined);
	const template = templateFor(routine, weekday, holiday);
	if (!template) return { date, weekday, template: '', holiday, choices: [], items: [] };
	const choices = routine.templates[template].choices ?? {};
	const resolved = new Map<string, ResolvedChoice>();
	const overridesForTemplate = overrides.choices?.[template] ?? {};
	const items = resolveEntries(routine.templates[template].items, routine, choices, (branch) => {
		const definition = choices[branch.choice];
		if (!definition) throw new Error(`Unknown choice "${branch.choice}"`);
		const selected =
			resolved.get(branch.choice) ??
			resolveChoice(branch.choice, definition, weekday, overridesForTemplate[branch.choice]);
		if (!selected) return undefined;
		resolved.set(branch.choice, selected);
		return selected.value;
	});

	return {
		date,
		weekday,
		template,
		theme: routine.templates[template].theme,
		holiday,
		choices: [...resolved.values()],
		items
	};
}

/**
 * The item happening at `now` (minutes on the day's clock): the latest-started one still running,
 * or the first one when nothing has started yet. -1 for an empty day.
 * When every started item has ended, `index` is -1 and `free` is how many items have passed:
 * the time is free until the next item, or the day is done.
 */
export function currentIndex(
	items: ResolvedItem[],
	now: number
): { index: number; upcoming: boolean; free?: number } {
	if (items.length === 0) return { index: -1, upcoming: false };
	let started = 0;
	while (started < items.length && items[started].sortKey <= now) started++;
	if (started === 0) return { index: 0, upcoming: true };
	// An item without a duration lasts until the next one starts.
	for (let i = started - 1; i >= 0; i--) {
		const { sortKey, duration } = items[i];
		if (!duration ? i === started - 1 : now < sortKey + duration) return { index: i, upcoming: false };
	}
	return { index: -1, upcoming: false, free: started };
}
