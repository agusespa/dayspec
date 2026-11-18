import { describe, expect, it } from 'vitest';
import { currentIndex, matches, resolveDay } from './resolve.ts';
import type { Routine } from './types.ts';
const MON = '2026-11-16';
const TUE = '2026-11-17';
function routine(partial: Partial<Routine> = {}): Routine {
	return {
		days: {
			all: { on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], items: [{ title: 'Only', duration: 5 }] }
		},
		...partial
	};
}
describe('matches', () => {
	it('checks weekdays and choice values', () => {
		expect(matches({ days: ['mon'] }, {}, 'mon')).toBe(true);
		expect(matches({ days: ['mon'] }, {}, 'tue')).toBe(false);
		expect(matches({ place: 'office' }, { place: 'office' }, 'mon')).toBe(true);
		expect(matches({ place: ['office', 'home'] }, { place: 'home' }, 'mon')).toBe(true);
		expect(matches({ place: 'office' }, {}, 'mon')).toBe(false);
		expect(matches({ gym: true }, { gym: false }, 'mon')).toBe(false);
		expect(matches({ place: 'office', days: ['mon'] }, { place: 'office' }, 'tue')).toBe(false);
	});
	it('treats `not` as true when the choice does not apply', () => {
		expect(matches({ evening: { not: 'workshop' } }, { evening: 'workshop' }, 'mon')).toBe(false);
		expect(matches({ evening: { not: 'workshop' } }, { evening: 'gym' }, 'mon')).toBe(true);
		expect(matches({ evening: { not: 'workshop' } }, {}, 'mon')).toBe(true);
	});
});
describe('resolveDay', () => {
	it("gives each item its category's colour", () => {
		const day = resolveDay(
			routine({
				categories: { rest: { name: 'Rest', color: 'indigo' } },
				days: {
					all: {
						on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
						items: [
							{ title: 'Nap', duration: 20, category: 'rest' },
							{ title: 'Walk', duration: 20 }
						]
					}
				}
			}),
			MON
		);
		expect(day.items.map((item) => item.color)).toEqual(['indigo', undefined]);
	});
	it('records where each item is defined, so it can be edited', () => {
		const day = resolveDay(
			routine({
				blocks: {
					b: {
						name: 'B',
						items: [{ title: 'Tea', duration: 5 }, { items: [{ title: 'Toast', duration: 5 }] }]
					}
				},
				days: {
					all: {
						on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
						items: [
							{ title: 'Wake', time: '06:00', duration: 5 },
							{ items: [{ title: 'Run', time: '06:30', duration: 5 }] },
							{ use: 'b', time: '07:00' }
						]
					}
				}
			}),
			MON
		);
		expect(day.items.map((item) => [item.title, item.source, item.sharedBlock?.key])).toEqual([
			['Wake', { path: [0] }, undefined],
			['Run', { path: [1, 0] }, undefined],
			['Tea', { block: 'b', path: [0] }, 'b'],
			['Toast', { block: 'b', path: [1, 0] }, 'b']
		]);
	});
	it('says why each item is in the day, using the choice labels', () => {
		const day = resolveDay(
			routine({
				categories: { chores: { name: 'Chores', color: 'orange' } },
				blocks: { b: { name: 'B', items: [{ title: 'Inner', duration: 5, when: { days: ['mon'] } }] } },
				days: {
					all: {
						on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
						choices: {
							gym: { label: 'Gym', type: 'toggle', default: true },
							place: { options: { office: { label: 'Office' }, home: {} }, default: 'office' }
						},
						items: [
							{ title: 'Always', duration: 5, category: 'chores' },
							{ when: { gym: true }, items: [{ title: 'Lift', duration: 5, when: { place: 'office' } }] },
							{ use: 'b', time: '08:00', when: { place: 'office' } }
						]
					}
				}
			}),
			MON
		);
		expect(day.items.map((item) => [item.title, item.categoryName, item.conditions])).toEqual([
			['Always', 'Chores', []],
			['Lift', undefined, ['Gym on', 'Place: Office']],
			['Inner', undefined, ['Place: Office', 'Mon']]
		]);
	});
	it("gives a block its own colour and its items the block's category unless they set one", () => {
		const day = resolveDay(
			routine({
				categories: {
					health: { name: 'Health', color: 'green' },
					chores: { name: 'Chores', color: 'orange' },
					rest: { name: 'Rest', color: 'indigo' }
				},
				blocks: {
					morning: {
						name: 'Morning',
						category: 'health',
						items: [
							{ title: 'Stretch', duration: 5 },
							{ title: 'Make bed', duration: 5, category: 'chores' },
							{ items: [{ title: 'Yoga', duration: 5 }] },
							{ use: 'plain' }
						]
					},
					plain: { name: 'Plain', items: [{ title: 'Water', duration: 5 }] },
					loose: { name: 'Loose', items: [{ title: 'Read', duration: 5 }] }
				},
				days: {
					all: {
						on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
						items: [
							{ use: 'morning', time: '07:00' },
							{ use: 'loose', time: '21:00' }
						]
					}
				}
			}),
			MON
		);
		expect(day.items.map((item) => [item.title, item.color, item.sharedBlock?.color])).toEqual([
			['Stretch', 'green', 'green'],
			['Make bed', 'orange', 'green'],
			['Yoga', 'green', 'green'],
			['Water', 'green', 'green'],
			['Read', undefined, undefined]
		]);
	});
	it('expands blocks at their occurrence start and sorts by time', () => {
		const r = routine({
			blocks: {
				tea: {
					name: 'Tea',
					items: [{ title: 'Tea', note: 'Green', duration: 5 }]
				},
				evening: {
					name: 'Evening',
					items: [
						{ time: '20:00', title: 'Read', duration: 5 },
						{ time: '19:00', title: 'Cook', duration: 5 }
					]
				}
			},
			days: {
				all: {
					on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
					items: [
						{ use: 'evening' },
						{ time: '08:00', use: 'tea', note: 'Black' },
						{ title: 'Untimed', duration: 5 },
						{ time: '07:00', title: 'Wake', duration: 5 }
					]
				}
			}
		});
		const day = resolveDay(r, MON);
		expect(day.items.map((i) => i.title)).toEqual(['Wake', 'Tea', 'Untimed', 'Cook', 'Read']);
		expect(day.items[1]).toMatchObject({ time: '08:00', note: 'Green' });
	});
	it('sorts times before the day starts after the rest', () => {
		const r = routine({
			settings: { day_starts_at: '04:00' },
			days: {
				all: {
					on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
					items: [
						{ time: '01:30', title: 'Late', duration: 5 },
						{ time: '23:00', title: 'Bed', duration: 5 },
						{ time: '04:00', title: 'Early', duration: 5 }
					]
				}
			}
		});
		expect(resolveDay(r, MON).items.map((i) => i.title)).toEqual(['Early', 'Bed', 'Late']);
	});
	it('settles choices from overrides, weekday defaults and availability', () => {
		const r = routine({
			days: {
				all: {
					on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
					choices: {
						place: { options: { office: {}, home: {} }, default: { mon: 'office', tue: 'home' } },
						extra: { type: 'toggle', active_when: { place: 'home' }, default: true },
						plan: { options: { a: {}, b: { only_on: ['mon'] } }, default: 'b' }
					},
					items: [
						{ title: 'Office', when: { place: 'office' }, duration: 5 },
						{ title: 'Extra', when: { extra: true }, duration: 5 }
					]
				}
			}
		});
		const mon = resolveDay(r, MON);
		expect(mon.choices.map((c) => [c.name, c.value])).toEqual([
			['place', 'office'],
			['plan', 'b']
		]);
		expect(mon.items.map((i) => i.title)).toEqual(['Office']);
		const tue = resolveDay(r, TUE);
		expect(tue.choices.map((c) => [c.name, c.value])).toEqual([
			['place', 'home'],
			['extra', true],
			['plan', 'a']
		]);
		expect(tue.items.map((i) => i.title)).toEqual(['Extra']);
		const overridden = resolveDay(r, MON, { choices: { place: 'home', extra: false, plan: 'nope' } });
		expect(overridden.choices.map((c) => c.value)).toEqual(['home', false, 'b']);
	});
	it('preserves notes and gives repeated timeline entries unique IDs', () => {
		const r = routine({
			days: {
				all: {
					on: ['mon'],
					items: [
						{ time: '07:00', title: 'Bathroom', note: 'Brush teeth\nWash face', duration: 5 },
						{ time: '22:00', title: 'Bathroom', note: 'Prepare for bed', duration: 5 },
						{ title: 'Note', duration: 5 },
						{ title: 'Note', duration: 5 }
					]
				}
			}
		});
		const day = resolveDay(r, MON);
		expect(day.items[0].note).toBe('Brush teeth\nWash face');
		expect(day.items[1].note).toBe('Prepare for bed');
		expect(new Set(day.items.map((i) => i.id)).size).toBe(day.items.length);
	});
	it('resolves activity URLs', () => {
		const r = routine({
			days: {
				all: {
					on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
					items: [
						{
							title: 'Yoga',
							link: ['https://example.com/yoga', 'https://example.com/cal', 'https://other.example.org/x'],
							duration: 5
						}
					]
				}
			}
		});
		expect(resolveDay(r, MON).items[0].links).toEqual([
			{ label: 'example.com', url: 'https://example.com/yoga' },
			{ label: 'example.com', url: 'https://example.com/cal' },
			{ label: 'other.example.org', url: 'https://other.example.org/x' }
		]);
	});
});
describe('currentIndex', () => {
	const items = [480, 600, 600, 900].map((sortKey, i) => ({
		id: String(i),
		duration: 5,
		approx: false,
		title: String(i),
		alert: false,
		links: [],
		conditions: [],
		sortKey
	}));
	it('picks the last started item, or the first one before the day begins', () => {
		expect(currentIndex(items, 300)).toEqual({ index: 0, upcoming: true });
		expect(currentIndex(items, 480)).toEqual({ index: 0, upcoming: false });
		expect(currentIndex(items, 700)).toEqual({ index: 2, upcoming: false });
		expect(currentIndex(items, 1500)).toEqual({ index: 3, upcoming: false });
		expect(currentIndex([], 700)).toEqual({ index: -1, upcoming: false });
	});
});
describe('automatic Swedish holidays', () => {
	const r = routine({
		settings: { holiday: 'off' },
		days: {
			all: { on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], items: [{ title: 'Work', duration: 5 }] },
			off: { on: [], items: [{ title: 'Rest', duration: 5 }] }
		}
	});
	it('uses the holiday template automatically, including in another year', () => {
		for (const date of ['2026-12-25', '2027-03-26']) {
			expect(resolveDay(r, date)).toMatchObject({ holiday: true, template: 'off' });
		}
	});
	it('lets an explicit false override a public holiday', () => {
		expect(resolveDay(r, '2026-12-25', { holiday: false })).toMatchObject({
			holiday: false,
			template: 'all'
		});
	});
	it('lets an explicit true mark an ordinary day as a holiday', () => {
		expect(resolveDay(r, TUE, { holiday: true })).toMatchObject({ holiday: true, template: 'off' });
	});
	it('restores the calendar when an override is cleared', () => {
		expect(resolveDay(r, '2026-12-25', { holiday: undefined }).holiday).toBe(true);
		expect(resolveDay(r, TUE, { holiday: undefined }).holiday).toBe(false);
	});
});
it('resolves unassigned days and empty libraries safely, including holidays', () => {
	const partial: Routine = {
		days: { monday: { on: ['mon'], items: [{ title: 'Monday routine', duration: 5 }] } }
	};
	expect(resolveDay(partial, TUE).items).toEqual([]);
	expect(resolveDay(partial, TUE).template).toBe('');
	expect(resolveDay(partial, MON).template).toBe('monday');
	expect(resolveDay(partial, MON, { holiday: true }).items[0].title).toBe('Monday routine');
	expect(resolveDay({ days: {} }, MON, { holiday: true }).items).toEqual([]);
});
describe('automatic Swedish holiday preference', () => {
	const r: Routine = {
		settings: { holiday: 'off' },
		days: {
			work: { on: ['fri'], items: [{ title: 'Work', duration: 5 }] },
			off: { on: ['sat'], items: [{ title: 'Rest', duration: 5 }] }
		}
	};
	it('defaults to the holiday calendar and can be disabled', () => {
		expect(resolveDay(r, '2026-12-25').template).toBe('off');
		const disabled: Routine = { ...r, settings: { ...r.settings, automatic_swedish_holidays: false } };
		expect(resolveDay(disabled, '2026-12-25')).toMatchObject({ holiday: false, template: 'work' });
		expect(
			resolveDay(
				{ ...disabled, settings: { ...disabled.settings, automatic_swedish_holidays: true } },
				'2026-12-25'
			).template
		).toBe('off');
	});
	it('preserves explicit daily choices regardless of the calendar preference', () => {
		expect(resolveDay(r, '2026-12-25', { holiday: false }).template).toBe('work');
		const disabled: Routine = { ...r, settings: { ...r.settings, automatic_swedish_holidays: false } };
		expect(resolveDay(disabled, '2026-12-25', { holiday: true }).template).toBe('off');
	});
});

describe('holiday templates', () => {
	it('uses an explicit template independent of its ID or weekday assignments', () => {
		const routine: Routine = {
			settings: { holiday: 'template_2' },
			days: {
				template: { on: ['mon'], items: [{ title: 'Work', duration: 60 }] },
				template_2: { on: ['sat'], items: [{ title: 'Rest', duration: 30 }] }
			}
		};
		expect(resolveDay(routine, '2026-11-16', { holiday: true }).items[0].title).toBe('Rest');
		delete routine.settings!.holiday;
		expect(resolveDay(routine, '2026-11-16', { holiday: true }).items[0].title).toBe('Work');
	});
	it('does not crash when a holiday uses a template with no available options that weekday', () => {
		const routine: Routine = {
			settings: { holiday: 'weekend' },
			days: {
				weekend: {
					on: ['sat'],
					choices: { meal: { options: { a: { only_on: ['sat'] }, b: { only_on: ['sat'] } }, default: 'a' } },
					items: [{ title: 'Conditional', duration: 5, when: { meal: 'a' } }]
				}
			}
		};
		const day = resolveDay(routine, '2026-11-16', { holiday: true });
		expect(day.choices).toEqual([]);
		expect(day.items).toEqual([]);
	});
});
