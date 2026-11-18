import { humanize, matches } from './resolve.ts';
import type { Choice, ChoiceValue, Entry } from './types.ts';

export interface BranchOption {
	value: ChoiceValue;
	label: string;
}
export interface TimelineSection {
	start: number;
	indices: number[];
	choice?: string;
}

export function branchOptions(choice: Choice): BranchOption[] {
	return choice.type === 'toggle'
		? [
				{ value: true, label: 'On' },
				{ value: false, label: 'Off' }
			]
		: Object.entries(choice.options ?? {}).map(([value, option]) => ({
				value,
				label: option.label ?? humanize(value)
			}));
}

/** Collect alternatives within each conditional stretch; common activities separate decision points. */
export function timelineSections(
	entries: Entry[],
	choices: Record<string, Choice>,
	excluded: string[] = [],
	parents: Record<string, string> = {}
): TimelineSection[] {
	const sections: TimelineSection[] = [];
	let alternatives = new Map<string, TimelineSection>();
	for (const [index, entry] of entries.entries()) {
		const ownChoice = Object.keys(entry.when ?? {}).find(
			(key) => key !== 'days' && choices[key] && entry.when?.[key] !== undefined && !excluded.includes(key)
		);
		const choice = ownChoice ? (parents[ownChoice] ?? ownChoice) : undefined;
		if (choice) {
			const section = alternatives.get(choice);
			if (section) section.indices.push(index);
			else {
				const next = { start: index, indices: [index], choice };
				sections.push(next);
				alternatives.set(choice, next);
			}
		} else {
			alternatives = new Map();
			const last = sections.at(-1);
			if (last && !last.choice) last.indices.push(index);
			else sections.push({ start: index, indices: [index] });
		}
	}
	return sections;
}

/** Only the displayed decision is evaluated; other conditions remain visible and editable. */
export function inBranch(entry: Entry, key: string, value: ChoiceValue): boolean {
	return matches({ [key]: entry.when?.[key] }, { [key]: value }, 'mon');
}

/** Empty groups let users build both sides without inventing placeholder activities. */
export function newBranch(key: string, choice: Choice): Entry[] {
	return branchOptions(choice).map(({ value }) => ({ when: { [key]: value }, items: [] }));
}

/** Move an entire decision past the neighbouring run, preserving both alternatives' order. */
export function moveSection(
	entries: Entry[],
	sections: TimelineSection[],
	start: number,
	direction: -1 | 1
): Entry[] {
	const index = sections.findIndex((section) => section.start === start);
	const target = index + direction;
	if (index < 0 || target < 0 || target >= sections.length) return entries;
	const reordered = [...sections];
	[reordered[index], reordered[target]] = [reordered[target], reordered[index]];
	return reordered.flatMap((section) => section.indices.map((i) => entries[i]));
}

/** A preview's parent selection only applies inside that branch, never to its siblings. */
export function branchView(
	entries: Entry[],
	choices: Record<string, Choice>,
	context: Record<string, ChoiceValue> = {}
): { entries: Entry[]; sections: TimelineSection[] } {
	const dependencies = (key: string) =>
		Object.keys(choices[key]?.active_when ?? {}).filter((k) => k !== 'days' && choices[k]);
	const inactive = (key: string) => {
		const keys = dependencies(key);
		return (
			keys.length > 0 &&
			keys.every((k) => Object.hasOwn(context, k)) &&
			!matches(Object.fromEntries(keys.map((k) => [k, choices[key].active_when![k]])), context, 'mon')
		);
	};
	const scope = (items: Entry[]): Entry[] =>
		items.flatMap((entry) => {
			const when = { ...entry.when };
			for (const [key, condition] of Object.entries(when)) {
				if (key === 'days') continue;
				if (Object.hasOwn(context, key)) {
					if (!matches({ [key]: condition }, context, 'mon')) return [];
					delete when[key];
				} else if (inactive(key)) {
					// An exclusion such as "not workshop" also holds outside the Office branch.
					if (!matches({ [key]: condition }, {}, 'mon')) return [];
					delete when[key];
				}
			}
			const next: Entry = { ...entry, ...('items' in entry ? { items: scope(entry.items) } : {}) };
			if (Object.keys(when).length) next.when = when;
			else delete next.when;
			return 'items' in next && !next.when ? next.items : [next];
		});
	const parents: Record<string, string> = {};
	for (const name of Object.keys(choices)) {
		let parent = name;
		const visited = new Set<string>([name]);
		while (true) {
			const keys = dependencies(parent);
			if (keys.length !== 1 || Object.hasOwn(context, keys[0]) || visited.has(keys[0])) break;
			parent = keys[0];
			visited.add(parent);
		}
		parents[name] = parent;
	}
	const scoped = scope(entries);
	const excluded = Object.keys(choices).filter(
		(key) =>
			Object.hasOwn(context, key) ||
			(Object.keys(context).length > 0 &&
				!dependencies(parents[key]).some((parent) => Object.hasOwn(context, parent)))
	);
	return { entries: scoped, sections: timelineSections(scoped, choices, excluded, parents) };
}
