import { branchOptions } from './branches.ts';
import { humanize, resolveEntries, type ResolvedItem } from './resolve.ts';
import type { Choice, Routine } from './types.ts';

export interface Overlap {
	first: { title: string; time: string; end: string };
	second: { title: string; time: string };
	/** The choice options under which the overlap happens; empty when it happens on every path. */
	when: string[];
}

/** Enough to cover every realistic template; beyond it only the first combinations are checked. */
const MAX_COMBINATIONS = 256;

function combinations(choices: Record<string, Choice>): Record<string, string>[] {
	let combos: Record<string, string>[] = [{}];
	for (const [name, choice] of Object.entries(choices)) {
		const options = Object.keys(choice.options);
		if (!options.length) continue;
		combos = combos
			.flatMap((combo) => options.map((option) => ({ ...combo, [name]: option })))
			.slice(0, MAX_COMBINATIONS);
	}
	return combos;
}

function overlapsIn(items: ResolvedItem[]): [ResolvedItem, ResolvedItem][] {
	const found: [ResolvedItem, ResolvedItem][] = [];
	let latest: ResolvedItem | undefined;
	for (const item of items) {
		if (!item.time) continue;
		if (latest && item.sortKey < latest.sortKey + latest.duration) found.push([latest, item]);
		if (!latest || item.sortKey + item.duration > latest.sortKey + latest.duration) latest = item;
	}
	return found;
}

/** Timed activities in a template that start before an earlier one ends, on any combination of choices. */
export function templateOverlaps(routine: Routine, template: string): Overlap[] {
	const day = routine.templates[template];
	if (!day) return [];
	const choices = day.choices ?? {};
	const combos = combinations(choices);
	const byKey = new Map<string, { overlap: Overlap; combos: Record<string, string>[] }>();
	for (const combo of combos) {
		let items: ResolvedItem[];
		try {
			items = resolveEntries(day.items, routine, choices, (branch) => combo[branch.choice]);
		} catch {
			// Drafts can reference blocks that no longer exist; validation reports those on save.
			return [];
		}
		for (const [a, b] of overlapsIn(items)) {
			const key = `${a.time}|${a.title}|${b.time}|${b.title}`;
			const entry = byKey.get(key) ?? {
				overlap: {
					first: { title: a.title, time: a.time!, end: a.end ?? '' },
					second: { title: b.title, time: b.time! },
					when: []
				},
				combos: []
			};
			entry.combos.push(combo);
			byKey.set(key, entry);
		}
	}
	return [...byKey.values()].map(({ overlap, combos: hits }) => {
		if (hits.length === combos.length) return overlap;
		// Name the options shared by every combination where the overlap happens.
		const when = Object.keys(hits[0])
			.filter((name) => hits.every((combo) => combo[name] === hits[0][name]))
			.map((name) => {
				const choice = choices[name];
				const option = branchOptions(choice).find((o) => o.value === hits[0][name]);
				return `${choice.label ?? humanize(name)}: ${option?.label ?? hits[0][name]}`;
			});
		return { ...overlap, when };
	});
}
