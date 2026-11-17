/** The shape of routine.default.json. routine.schema.json is the authoritative definition. */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type Kind = 'maintenance' | 'health' | 'growth' | 'alert' | 'night';

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
	kind?: Kind;
	alert?: boolean;
	link?: string | string[];
	note?: string;
	when?: When;
}

export interface UseEntry {
	use: string;
	time?: string;
	when?: When;
}

export interface Group {
	when?: When;
	items: Entry[];
}

export type Entry = ItemDef | UseEntry | Group;

export interface Block {
	name: string;
	items: Entry[];
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
	settings?: { day_starts_at?: string; holiday?: string; automatic_swedish_holidays?: boolean };
	blocks?: Record<string, Block>;
	days: Record<string, DayTemplate>;
}

export function isGroup(entry: Entry): entry is Group {
	return 'items' in entry;
}

export function isUse(entry: Entry): entry is UseEntry {
	return 'use' in entry;
}

export const DEFAULT_DAY_STARTS_AT = '04:00';
