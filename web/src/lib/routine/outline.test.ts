import { expect, it } from 'vitest';
import { outlineDay, outlineChoices } from './outline.ts';
import { resolveDay } from './resolve.ts';
import type { Routine } from './types.ts';
it('outlines all explicit paths in chronological order without condition labels', () => {
	const routine: Routine = {
		templates: {
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
						choice: 'place',
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

it('keeps nested block timing, categories, alerts, notes and repeated occurrences identical to Daily', () => {
	const routine: Routine = {
		settings: { automatic_swedish_holidays: false },
		categories: { health: { name: 'Health', color: 'green' }, rest: { name: 'Rest', color: 'orange' } },
		blocks: {
			inner: {
				name: 'Inner',
				items: [
					{ title: 'Stretch', duration: 7, alert: true, note: 'Slowly', link: 'https://example.com/stretch' }
				]
			},
			outer: {
				name: 'Outer',
				category: 'health',
				items: [{ use: 'inner' }, { title: 'Rest', duration: 4, category: 'rest' }]
			}
		},
		templates: {
			day: {
				on: ['mon'],
				items: [
					{ use: 'outer', time: '23:55' },
					{ use: 'outer', time: '01:00' }
				]
			}
		}
	};
	const daily = resolveDay(routine, '2026-11-16').items.map(({ source, ...item }) => item);
	const preview = outlineDay(routine, 'day').items;
	expect(preview).toEqual(daily);
	expect(preview.map((item) => [item.time, item.end])).toEqual([
		['23:55', '00:02'],
		['00:02', '00:06'],
		['01:00', '01:07'],
		['01:07', '01:11']
	]);
	expect(preview.map((item) => item.categoryName)).toEqual(['Health', 'Rest', 'Health', 'Rest']);
	expect(new Set(preview.map((item) => item.sharedBlock?.id)).size).toBe(2);
	expect(outlineChoices(routine.templates.day)).toEqual([]);
});
