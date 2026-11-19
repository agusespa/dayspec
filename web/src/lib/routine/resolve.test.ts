import { describe, expect, it } from 'vitest';
import { resolveDay, currentIndex, templateFor, slug, resolveLink, withCategory } from './resolve.ts';
import type { Routine } from './types.ts';
const MON = '2026-11-16';
const routine: Routine = {
	settings: { automatic_swedish_holidays: false, holiday: 'off' },
	categories: { health: { name: 'Health', color: 'green' }, chores: { name: 'Chores', color: 'orange' } },
	blocks: {
		inner: { name: 'Inner', items: [{ title: 'Water', duration: 5 }] },
		morning: {
			name: 'Morning',
			category: 'health',
			items: [
				{ title: 'Stretch', duration: 15, alert: true },
				{ use: 'inner' },
				{
					title: 'Wash',
					duration: 10,
					category: 'chores',
					note: 'Wash face',
					link: 'https://example.com/care'
				}
			]
		}
	},
	days: {
		work: {
			on: ['mon', 'tue', 'wed', 'thu', 'fri'],
			choices: {
				location: {
					label: 'Location',
					options: { home: {}, office: {} },
					default: { mon: 'office', tue: 'office', wed: 'home', thu: 'office', fri: 'home' }
				},
				evening: { options: { gym: {}, workshop: { only_on: ['mon'] } }, default: 'gym' }
			},
			items: [
				{ title: 'Breakfast', time: '06:30', duration: 15 },
				{ use: 'morning', time: '07:00' },
				{
					alternative: 'location',
					paths: {
						home: [{ title: 'Home', time: '08:00', duration: 60 }],
						office: [{ title: 'Office', time: '08:00', duration: 60 }]
					}
				},
				{
					alternative: 'evening',
					paths: {
						gym: [{ title: 'Lift', time: '17:00', duration: 45 }],
						workshop: [{ title: 'Workshop', time: '17:00', duration: 180 }]
					}
				},
				{ title: 'Reading', time: '01:00', duration: 20 }
			]
		},
		off: { on: ['sat', 'sun'], items: [{ title: 'Rest', time: '09:00', duration: 30 }] }
	}
};
describe('routine resolution', () => {
	it('selects the weekday template, derives times from block durations, and sorts after midnight last', () => {
		const day = resolveDay(routine, MON);
		expect(day.template).toBe('work');
		expect(day.items.map((i) => [i.title, i.time, i.end])).toEqual([
			['Breakfast', '06:30', '06:45'],
			['Stretch', '07:00', '07:15'],
			['Water', '07:15', '07:20'],
			['Wash', '07:20', '07:30'],
			['Office', '08:00', '09:00'],
			['Lift', '17:00', '17:45'],
			['Reading', '01:00', '01:20']
		]);
		expect(day.items.at(-1)!.sortKey).toBe(1500);
	});
	it('preserves inherited categories, explicit overrides, notes, links and alerts through nested blocks', () => {
		const day = resolveDay(routine, MON);
		expect(day.items.find((i) => i.title === 'Stretch')).toMatchObject({ color: 'green', alert: true });
		expect(day.items.find((i) => i.title === 'Water')).toMatchObject({ color: 'green' });
		expect(day.items.find((i) => i.title === 'Wash')).toMatchObject({
			color: 'orange',
			note: 'Wash face',
			link: { url: 'https://example.com/care', label: 'example.com' }
		});
		expect(day.items.find((i) => i.title === 'Water')!.source).toEqual({ block: 'inner', path: [0] });
	});
	it('uses weekday defaults and permits independent per-date overrides', () => {
		expect(resolveDay(routine, '2026-11-18').items.some((i) => i.title === 'Home')).toBe(true);
		const day = resolveDay(routine, MON, { choices: { location: 'home', evening: 'workshop' } });
		expect(day.items.map((i) => i.title)).toContain('Home');
		expect(day.items.map((i) => i.title)).toContain('Workshop');
		expect(day.choices.map((c) => c.value)).toEqual(['home', 'workshop']);
	});
	it('offers options only on their assigned weekdays and ignores invalid overrides', () => {
		expect(
			resolveDay(routine, MON)
				.choices.find((c) => c.name === 'evening')!
				.options.map((o) => o.value)
		).toContain('workshop');
		const day = resolveDay(routine, '2026-11-17', { choices: { evening: 'workshop', location: 'unknown' } });
		expect(day.choices.map((c) => c.value)).toEqual(['office', 'gym']);
		expect(day.items.some((i) => i.title === 'Workshop')).toBe(false);
	});
	it('does not expose unused alternative definitions as day controls', () => {
		const copy = structuredClone(routine);
		copy.days.work.choices!.unused = { options: { a: {}, b: {} }, default: 'a' };
		expect(resolveDay(copy, MON).choices.map((c) => c.name)).toEqual(['location', 'evening']);
	});
	it('keeps repeated activities unique without changing their notes', () => {
		const copy: Routine = {
			days: {
				day: {
					on: ['mon'],
					items: [
						{ title: 'Read', time: '08:00', duration: 5, note: 'First' },
						{ title: 'Read', time: '08:00', duration: 5, note: 'Second' }
					]
				}
			}
		};
		const day = resolveDay(copy, MON);
		expect(day.items.map((i) => i.note)).toEqual(['First', 'Second']);
		expect(new Set(day.items.map((i) => i.id)).size).toBe(2);
	});
	it('uses the chosen holiday template and falls back to the weekday when none is configured', () => {
		expect(resolveDay(routine, MON, { holiday: true }).items[0].title).toBe('Rest');
		const copy = structuredClone(routine);
		delete copy.settings!.holiday;
		expect(resolveDay(copy, MON, { holiday: true }).template).toBe('work');
		expect(resolveDay({ days: {} }, MON).items).toEqual([]);
	});
	it('uses automatic Swedish holidays unless the preference or date override disables them', () => {
		const copy = { ...routine, settings: { ...routine.settings, automatic_swedish_holidays: true } };
		expect(resolveDay(copy, '2026-12-25').template).toBe('off');
		expect(resolveDay(copy, '2026-12-25', { holiday: false }).template).toBe('work');
		expect(resolveDay(routine, '2026-12-25').template).toBe('work');
	});
	it('skips a fork with no options available on the viewed weekday without crashing', () => {
		const copy: Routine = {
			settings: { holiday: 'weekend' },
			days: {
				weekend: {
					on: ['sat'],
					choices: { meal: { options: { a: { only_on: ['sat'] }, b: { only_on: ['sat'] } }, default: 'a' } },
					items: [{ alternative: 'meal', paths: { a: [{ title: 'Lunch', time: '12:00', duration: 30 }] } }]
				}
			}
		};
		expect(resolveDay(copy, MON, { holiday: true }).items).toEqual([]);
		expect(resolveDay(copy, MON, { holiday: true }).choices).toEqual([]);
	});
	it('does not mutate stored templates when resolving another day', () => {
		const before = structuredClone(routine);
		resolveDay(routine, MON, { choices: { location: 'home' } });
		expect(routine).toEqual(before);
	});
});
describe('small resolver helpers', () => {
	it('keeps URL labels and inherited category fields', () => {
		expect(resolveLink(undefined)).toBeUndefined();
		expect(resolveLink('https://example.com/page')).toEqual({
			label: 'example.com',
			url: 'https://example.com/page'
		});
		expect(withCategory({ title: 'Read', duration: 5 }, 'health')).toHaveProperty('category', 'health');
		expect(withCategory({ title: 'Read', duration: 5, category: 'chores' }, 'health')).toHaveProperty(
			'category',
			'chores'
		);
		expect(slug('Wake-up ☀')).toBe('wake-up');
	});
	it('resolves direct template assignments and missing weekdays', () => {
		expect(templateFor(routine, 'mon', false)).toBe('work');
		expect(templateFor({ days: {} }, 'mon', false)).toBe('');
	});
	it('identifies upcoming, current, tied and final activities', () => {
		const items = [480, 600, 600, 900].map((sortKey) => ({ sortKey })) as Parameters<typeof currentIndex>[0];
		expect(currentIndex(items, 300)).toEqual({ index: 0, upcoming: true });
		expect(currentIndex(items, 480)).toEqual({ index: 0, upcoming: false });
		expect(currentIndex(items, 700)).toEqual({ index: 2, upcoming: false });
		expect(currentIndex(items, 1500)).toEqual({ index: 3, upcoming: false });
		expect(currentIndex([], 700)).toEqual({ index: -1, upcoming: false });
	});
});
