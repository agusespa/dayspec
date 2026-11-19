import { expect, it } from 'vitest';
import { outlineDay } from './outline.ts';
import type { Routine } from './types.ts';
it('outlines all explicit paths in chronological order without condition labels', () => {
	const routine: Routine = {
		days: {
			weekday: {
				on: ['mon', 'tue'],
				choices: {
					place: {
						options: { office: {}, home: { only_on: ['tue'] } },
						default: { mon: 'office', tue: 'home' }
					}
				},
				items: [
					{
						alternative: 'place',
						paths: {
							home: [{ title: 'Late', time: '09:00', duration: 5 }],
							office: [{ title: 'Early', time: '08:00', duration: 5, note: 'Make tea' }]
						}
					}
				]
			}
		}
	};
	const before = structuredClone(routine);
	const day = outlineDay(routine, 'weekday');
	expect(day.items.map((i) => [i.time, i.title])).toEqual([
		['08:00', 'Early'],
		['09:00', 'Late']
	]);
	expect(day.items[0].note).toBe('Make tea');
	expect(day.choices[0].options).toEqual([
		{ label: 'Office', defaultOn: ['mon'], onlyOn: undefined },
		{ label: 'Home', defaultOn: ['tue'], onlyOn: ['tue'] }
	]);
	expect(day.items[0]).not.toHaveProperty('conditions');
	expect(routine).toEqual(before);
});
