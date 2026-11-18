import { describe, expect, it } from 'vitest';
import { groupTimeline, timelineDuration, timelineGaps } from './timeline.ts';
import { resolveDay } from './resolve.ts';
import { outlineDay } from './outline.ts';
import type { Routine } from './types.ts';
const routine: Routine = {
	blocks: {
		morning: {
			name: 'Morning',
			items: [
				{ title: 'Wash', duration: 10 },
				{ title: 'Breakfast', duration: 20, note: 'Vitamins' }
			]
		},
		nested: {
			name: 'Nested',
			items: [{ use: 'morning' }, { title: 'Leave', duration: 5 }]
		},
		tea: {
			name: 'Tea',
			items: [{ title: 'Tea', duration: 5 }]
		}
	},
	days: {
		daily: {
			on: ['mon'],
			items: [
				{ use: 'morning', time: '07:00' },
				{ title: 'Work', time: '09:00', duration: 5 },
				{ use: 'morning', time: '18:00' }
			]
		}
	}
};
describe('shared block timeline groups', () => {
	it('groups each occurrence separately while preserving times, notes, and original IDs', () => {
		const day = resolveDay(routine, '2026-11-16');
		const groups = groupTimeline(day.items);
		expect(groups.map((g) => [g.name, g.items.map((i) => i.title)])).toEqual([
			['Morning', ['Wash', 'Breakfast']],
			[undefined, ['Work']],
			['Morning', ['Wash', 'Breakfast']]
		]);
		expect(groups[0].id).not.toBe(groups[2].id);
		expect(groups[0].items[0]).toBe(day.items[0]);
		expect(groups[0].items.map((i) => [i.time, i.end])).toEqual([
			['07:00', '07:10'],
			['07:10', '07:30']
		]);
		expect(groups[0].items[1].note).toBe('Vitamins');
		expect(groups.flatMap((g) => g.items.map((i) => i.id))).toEqual(day.items.map((i) => i.id));
	});
	it('groups previews by the same occurrence boundaries', () => {
		const groups = groupTimeline(outlineDay(routine, 'daily').items);
		expect(groups.map((g) => g.items.length)).toEqual([2, 1, 2]);
		expect(groups[0].name).toBe('Morning');
	});
	it('keeps nested shared blocks inside the outer occurrence and supports one-item blocks', () => {
		const nested: Routine = {
			...routine,
			days: {
				daily: {
					on: ['mon'],
					items: [
						{ use: 'nested', time: '07:00' },
						{ use: 'tea', time: '08:00' }
					]
				}
			}
		};
		for (const items of [resolveDay(nested, '2026-11-16').items, outlineDay(nested, 'daily').items]) {
			const groups = groupTimeline(items);
			expect(groups.map((g) => [g.name, g.items.length])).toEqual([
				['Nested', 3],
				['Tea', 1]
			]);
		}
	});
	it('omits a block when all its items are filtered out', () => {
		const filtered: Routine = {
			...routine,
			blocks: {
				morning: {
					name: 'Morning',
					items: [{ title: 'Tuesday only', when: { days: ['tue'] }, duration: 5 }]
				}
			}
		};
		expect(groupTimeline(resolveDay(filtered, '2026-11-16').items).map((g) => g.name)).toEqual([undefined]);
	});
	it('does not merge identical blocks used in different conditional groups', () => {
		const grouped: Routine = {
			...routine,
			days: {
				daily: {
					on: ['mon'],
					items: [
						{ when: { days: ['mon'] }, items: [{ use: 'tea' }] },
						{ when: { days: ['mon'] }, items: [{ use: 'tea' }] }
					]
				}
			}
		};
		expect(groupTimeline(resolveDay(grouped, '2026-11-16').items)).toHaveLength(2);
		expect(groupTimeline(outlineDay(grouped, 'daily').items)).toHaveLength(2);
	});
	it('handles empty timelines', () => expect(groupTimeline([])).toEqual([]));
});
describe('unplanned timeline time', () => {
	function gaps(items: Routine['days'][string]['items']) {
		return [
			...timelineGaps(
				groupTimeline(resolveDay({ days: { daily: { on: ['mon'], items } } }, '2026-11-16').items)
			).values()
		];
	}
	it('shows the gap after a short shared block in daily and template views', () => {
		for (const items of [resolveDay(routine, '2026-11-16').items, outlineDay(routine, 'daily').items]) {
			expect([...timelineGaps(groupTimeline(items)).values()]).toEqual([
				{ time: '07:30', duration: 90 },
				{ time: '09:05', duration: 535 }
			]);
		}
	});
	it('adds gaps only between non-overlapping known activities', () => {
		expect(
			gaps([
				{ title: 'A', time: '07:00', duration: 5 },
				{ title: 'B', time: '08:00', duration: 5 }
			])
		).toEqual([{ time: '07:05', duration: 55 }]);
		for (const duration of [60, 90])
			expect(
				gaps([
					{ title: 'A', time: '07:00', duration },
					{ title: 'B', time: '08:00', duration: 5 }
				])
			).toEqual([]);
	});
	it('handles gaps crossing midnight', () => {
		expect(
			gaps([
				{ title: 'A', time: '23:50', duration: 5 },
				{ title: 'B', time: '00:10', duration: 5 }
			])
		).toEqual([{ time: '23:55', duration: 15 }]);
	});
	it('does not add unplanned time inside an overlapping activity', () => {
		expect(
			gaps([
				{ title: 'A', time: '07:00', duration: 120 },
				{ title: 'B', time: '07:30', duration: 5 },
				{ title: 'C', time: '08:00', duration: 5 }
			])
		).toEqual([]);
	});
	it('does not add a gap before the first or after the final activity', () => {
		expect(gaps([{ title: 'A', time: '07:00', duration: 5 }])).toEqual([]);
		expect(gaps([])).toEqual([]);
	});
});

it('keeps a full-day activity occupied across midnight', () => {
	const routine: Routine = {
		days: {
			daily: {
				on: ['mon'],
				items: [
					{ title: 'A', time: '06:00', duration: 1440 },
					{ title: 'B', time: '07:00', duration: 5 }
				]
			}
		}
	};
	const items = resolveDay(routine, '2026-11-16').items;
	expect(timelineGaps(groupTimeline(items)).size).toBe(0);
});

describe('timeline group duration', () => {
	function blockItems(items: Routine['days'][string]['items']) {
		const day = resolveDay({ ...routine, days: { daily: { on: ['mon'], items } } }, '2026-11-16');
		return groupTimeline(day.items)[0].items;
	}
	it('spans the clock when the block is timed', () => {
		expect(timelineDuration(blockItems([{ use: 'morning', time: '07:00' }]))).toBe(30);
	});
	it('sums item durations when the block has no time', () => {
		expect(timelineDuration(blockItems([{ use: 'morning' }]))).toBe(30);
	});
	it('has no duration for an empty group', () => expect(timelineDuration([])).toBeUndefined());
});
