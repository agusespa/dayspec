import type { ResolvedItem } from './resolve.ts';

export interface TimelineGroup<T> {
	id: string;
	name?: string;
	items: T[];
}

/** Group each block occurrence without changing the resolved schedule or item IDs. */
export function groupTimeline<T extends ResolvedItem>(items: T[]): TimelineGroup<T>[] {
	const groups: TimelineGroup<T>[] = [];
	const blocks = new Map<string, TimelineGroup<T>>();
	for (const item of items) {
		const block = item.sharedBlock;
		if (!block) {
			groups.push({ id: item.id, items: [item] });
			continue;
		}
		let group = blocks.get(block.id);
		if (!group) {
			group = { id: `block:${block.id}`, name: block.name, items: [] };
			blocks.set(block.id, group);
			groups.push(group);
		}
		group.items.push(item);
	}
	return groups;
}

/** Known end on the logical day clock, including activities crossing midnight. */
export function timelineEnd(items: ResolvedItem[]): number | undefined {
	if (!items.length || items.some((item) => !item.time)) return undefined;
	return Math.max(...items.map((item) => item.sortKey + item.duration));
}

/** Gaps are display-only; an activity without an end is never given an invented duration. */
export function timelineGaps<T extends ResolvedItem>(
	groups: TimelineGroup<T>[]
): Map<string, { time: string; duration: number }> {
	const gaps = new Map<string, { time: string; duration: number }>();
	let occupiedUntil = -Infinity;
	groups.forEach((group, index) => {
		const end = timelineEnd(group.items);
		if (end !== undefined) occupiedUntil = Math.max(occupiedUntil, end);
		const next = groups[index + 1]?.items[0];
		if (end === undefined || !next?.time || next.sortKey <= occupiedUntil) return;
		const minute = occupiedUntil % 1440;
		gaps.set(group.id, {
			time: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
			duration: next.sortKey - occupiedUntil
		});
	});
	return gaps;
}
