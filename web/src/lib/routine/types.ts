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

export type ChoiceValue = string;

export interface Activity {
	duration: number;
	title: string;
	category?: string;
	alert?: boolean;
	link?: string;
	note?: string;
}

export interface ItemDef extends Activity {
	time: string;
	approx?: boolean;
}

export interface UseEntry {
	use: string;
	time: string;
	/** Every time in the block occurrence follows this approximate start. */
	approx?: boolean;
}

export interface Branch {
	choice: string;
	paths: Record<string, Entry[]>;
}

export type Entry = ItemDef | UseEntry | Branch;

export type SharedEntry = Activity | Pick<UseEntry, 'use'>;

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
	options: Record<string, ChoiceOption>;
	default: ChoiceValue | Partial<Record<Weekday, ChoiceValue>>;
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
		holiday_template?: string;
		automatic_swedish_holidays?: boolean;
		calendar?: 'google';
	};
	categories?: Record<string, Category>;
	blocks?: Record<string, Block>;
	templates: Record<string, DayTemplate>;
}

export function isBranch(entry: Entry | SharedEntry): entry is Branch {
	return 'paths' in entry;
}

export function isUse<T extends Entry | SharedEntry>(entry: T): entry is Extract<T, { use: string }> {
	return 'use' in entry;
}

export const DEFAULT_DAY_STARTS_AT = '04:00';
