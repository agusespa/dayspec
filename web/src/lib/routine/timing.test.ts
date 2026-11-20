import { describe, expect, it } from 'vitest';
import { endTime, scheduleBlock } from './timing.ts';
import { resolveDay } from './resolve.ts';
import { outlineDay } from './outline.ts';
import type { Routine } from './types.ts';
describe('reusable durations', () => {
	it('derives end times solely from start and duration', () => {
		expect(endTime({ title: 'Read', time: '23:50', duration: 30 })).toBe('00:20');
		expect(endTime({ title: 'Read', time: '08:00', duration: 30 })).toBe('08:30');
		expect(endTime({ title: 'Read', duration: 30 })).toBeUndefined();
	});
	it('anchors a sequence without mutating blocks or guessing unknown durations', () => {
		const block = [
			{ title: 'Stretch', duration: 15 },
			{ title: 'Water', duration: 5 }
		];
		expect(scheduleBlock(block, '08:00').map((i) => [i.time, i.end])).toEqual([
			['08:00', '08:15'],
			['08:15', '08:20']
		]);
		expect(scheduleBlock(block, '18:00')[1].end).toBe('18:20');
		expect(block[0]).not.toHaveProperty('time');
		expect(
			scheduleBlock(
				[
					{ title: 'Untimed', duration: 5 },
					{ title: 'Later', duration: 10 }
				],
				'08:00'
			)[1].time
		).toBe('08:05');
		expect(scheduleBlock(block)[0].time).toBeUndefined();
	});
	it('schedules the same block differently in each template and agrees with its preview', () => {
		const routine: Routine = {
			blocks: {
				morning: {
					name: 'Morning',
					items: [
						{ title: 'Stretch', duration: 15 },
						{ title: 'Water', duration: 5 }
					]
				}
			},
			templates: {
				mon: { on: ['mon'], items: [{ use: 'morning', time: '08:00' }] },
				tue: { on: ['tue'], items: [{ use: 'morning', time: '10:00' }] }
			}
		};
		expect(resolveDay(routine, '2026-11-16').items.map((i) => [i.time, i.end])).toEqual([
			['08:00', '08:15'],
			['08:15', '08:20']
		]);
		const tuesday = resolveDay(routine, '2026-11-17').items;
		expect(tuesday.map((i) => [i.time, i.end])).toEqual([
			['10:00', '10:15'],
			['10:15', '10:20']
		]);
		expect(outlineDay(routine, 'tue').items.map((i) => [i.time, i.end])).toEqual(
			tuesday.map((i) => [i.time, i.end])
		);
		expect(routine.blocks?.morning.items).toEqual([
			{ title: 'Stretch', duration: 15 },
			{ title: 'Water', duration: 5 }
		]);
	});
	it('filters conditional block occurrences and resolves one-item blocks', () => {
		const routine: Routine = {
			blocks: {
				sequence: {
					name: 'Sequence',
					items: [{ title: 'Read', duration: 20 }]
				},
				single: {
					name: 'Single',
					items: [{ title: 'Tea', duration: 10 }]
				}
			},
			templates: {
				mon: {
					on: ['mon'],
					choices: { plan: { options: { include: {}, skip: {} }, default: 'skip' } },
					items: [
						{ use: 'sequence', time: '08:00' },
						{ choice: 'plan', paths: { include: [{ use: 'sequence', time: '10:00' }], skip: [] } },
						{ use: 'single', time: '23:55' }
					]
				}
			}
		};
		expect(resolveDay(routine, '2026-11-16').items.map((i) => [i.title, i.time, i.end])).toEqual([
			['Read', '08:00', '08:20'],
			['Tea', '23:55', '00:05']
		]);
	});
});
