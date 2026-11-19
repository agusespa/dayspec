/** The shape of routine.default.json. routine.schema.json is the authoritative definition. */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** The palette categories pick from; each is tuned for the dark theme in app.css. */
export const CATEGORY_COLORS = [
	'orange',
	'yellow',
	'green',
	'teal',
	'blue',
	'indigo',
	'violet',
	'pink',
	'red',
	'gray'
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export interface Category {
	name: string;
	color: CategoryColor;
}

export type ChoiceValue = string | boolean;

export type Condition = string | boolean | string[] | { not: string | string[] };

export interface When {
	days?: Weekday[];
	[choice: string]: Condition | Weekday[] | undefined;
}

export interface ItemDef {
	duration: number;
	time?: string;
	approx?: boolean;
	title: string;
	category?: string;
	alert?: boolean;
	link?: string | string[];
	note?: string;
}

export interface UseEntry {
	use: string;
	time?: string;
}

export interface Branch {
	when: When;
	items: Entry[];
}

export type Entry = ItemDef | UseEntry | Branch;

export type SharedEntry = Omit<ItemDef, 'time' | 'approx'> | Pick<UseEntry, 'use'>;

export interface Block {
	name: string;
	/** The block's colour, and the category of its items that don't set their own. */
	category?: string;
	items: SharedEntry[];
}

export interface ChoiceOption {
	label?: string;
	only_on?: Weekday[];
}

export interface Choice {
	label?: string;
	type?: 'select' | 'toggle';
	options?: Record<string, ChoiceOption>;
	default: ChoiceValue | Partial<Record<Weekday, ChoiceValue>>;
	active_when?: When;
}

export interface DayTemplate {
	on: Weekday[];
	theme?: string;
	choices?: Record<string, Choice>;
	items: Entry[];
}

export interface Routine {
	settings?: {
		day_starts_at?: string;
		holiday?: string;
		automatic_swedish_holidays?: boolean;
		calendar?: 'google';
	};
	categories?: Record<string, Category>;
	blocks?: Record<string, Block>;
	days: Record<string, DayTemplate>;
}

export function isBranch(entry: Entry): entry is Branch {
	return 'items' in entry;
}

export function isUse(entry: Entry): entry is UseEntry {
	return 'use' in entry;
}

export const DEFAULT_DAY_STARTS_AT = '04:00';
