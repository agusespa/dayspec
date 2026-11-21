import { describe, expect, it } from 'vitest';
import { templateOverlaps } from './overlaps.ts';
import type { Routine } from './types.ts';

function routine(items: Routine['templates'][string]['items'], extra: Partial<Routine> = {}): Routine {
	return {
		version: 1,
		templates: {
			weekday: {
				on: ['mon'],
				choices: {
					gym: {
						label: 'Gym',
						options: { yes: { label: 'Go' }, no: { label: 'Skip' } },
						default: 'yes'
					}
				},
				items
			}
		},
		...extra
	} as Routine;
}

describe('templateOverlaps', () => {
	it('finds an activity starting before the previous one ends', () => {
		const overlaps = templateOverlaps(
			routine([
				{ time: '07:00', title: 'Run', duration: 45 },
				{ time: '07:30', title: 'Breakfast', duration: 20 },
				{ time: '08:00', title: 'Work', duration: 60 }
			]),
			'weekday'
		);
		expect(overlaps).toEqual([
			{
				first: { title: 'Run', time: '07:00', end: '07:45' },
				second: { title: 'Breakfast', time: '07:30' },
				when: []
			}
		]);
	});

	it('ignores back-to-back activities', () => {
		expect(
			templateOverlaps(
				routine([
					{ time: '07:00', title: 'Run', duration: 30 },
					{ time: '07:30', title: 'Breakfast', duration: 20 }
				]),
				'weekday'
			)
		).toEqual([]);
	});

	it('names the option an overlap depends on', () => {
		const overlaps = templateOverlaps(
			routine([
				{ choice: 'gym', paths: { yes: [{ time: '07:00', title: 'Gym', duration: 60 }], no: [] } },
				{ time: '07:30', title: 'Breakfast', duration: 20 }
			]),
			'weekday'
		);
		expect(overlaps).toHaveLength(1);
		expect(overlaps[0].when).toEqual(['Gym: Go']);
	});

	it('checks activities scheduled inside shared blocks', () => {
		const overlaps = templateOverlaps(
			routine(
				[
					{ use: 'morning', time: '07:00' },
					{ time: '07:10', title: 'Call', duration: 15 }
				],
				{
					blocks: {
						morning: {
							name: 'Morning',
							items: [
								{ title: 'Stretch', duration: 5 },
								{ title: 'Shower', duration: 15 }
							]
						}
					}
				}
			),
			'weekday'
		);
		expect(overlaps.map((o) => [o.first.title, o.second.title])).toEqual([['Shower', 'Call']]);
	});
});
