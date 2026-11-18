import { describe, expect, it } from 'vitest';
import { describeWhen, outlineDay } from './outline.ts';
import type { Choice, Routine } from './types.ts';
const choices: Record<string, Choice> = {
	place: { options: { office: {}, wfh: { label: 'WFH' } }, default: 'office' },
	gym: { type: 'toggle', default: true }
};
describe('describeWhen', () => {
	it('labels every condition form with the choice and option labels', () => {
		expect(describeWhen({ days: ['mon', 'tue'] }, choices)).toEqual(['Mon, Tue']);
		expect(describeWhen({ place: 'wfh' }, choices)).toEqual(['Place: WFH']);
		expect(describeWhen({ place: ['office', 'wfh'] }, choices)).toEqual(['Place: Office or WFH']);
		expect(describeWhen({ place: { not: 'wfh' } }, choices)).toEqual(['Place: not WFH']);
		expect(describeWhen({ gym: false, days: ['fri'] }, choices)).toEqual(['Gym off', 'Fri']);
		expect(describeWhen(undefined, choices)).toEqual([]);
	});
});
describe('outlineDay', () => {
	const routine: Routine = {
		blocks: {
			tea: {
				name: 'Tea',
				items: [{ title: 'Tea', when: { days: ['tue'] }, duration: 5 }]
			}
		},
		days: {
			weekday: {
				on: ['mon', 'tue'],
				choices: {
					place: {
						options: { office: {}, home: { only_on: ['tue'] } },
						default: { mon: 'home', tue: 'home' }
					}
				},
				items: [
					{ time: '09:00', title: 'Late', when: { place: 'home' }, duration: 5 },
					{
						when: { place: 'office' },
						items: [{ time: '08:00', title: 'Early', note: 'Make tea', duration: 5 }]
					}
				]
			},
			weekend: { on: ['wed', 'thu', 'fri', 'sat', 'sun'], items: [{ title: 'Rest', duration: 5 }] }
		}
	};
	it('keeps every variant, in time order, with its conditions', () => {
		const day = outlineDay(routine, 'weekday');
		expect(day.items.map((i) => [i.time, i.title, i.conditions])).toEqual([
			['08:00', 'Early', ['Place: Office']],
			['09:00', 'Late', ['Place: Home']]
		]);
		expect(day.items[0].note).toBe('Make tea');
	});
	it('shows the default each weekday ends up with', () => {
		const [place] = outlineDay(routine, 'weekday').choices;
		// Home is only offered on Tuesday, so Monday falls back to the first option.
		expect(place.options).toEqual([
			{ label: 'Office', defaultOn: ['mon'], onlyOn: undefined },
			{ label: 'Home', defaultOn: ['tue'], onlyOn: ['tue'] }
		]);
	});
});

describe('conditions explained by an enclosing branch', () => {
	const routine: Routine = {
		blocks: {
			morning: {
				name: 'Morning',
				items: [
					{ title: 'Exercise', duration: 10, when: { place: ['office', 'wfh'], gym: true, days: ['mon'] } },
					{ title: 'Office only', duration: 10, when: { place: 'office' } },
					{ title: 'Not office', duration: 10, when: { place: { not: 'office' } } }
				]
			}
		},
		days: {
			day: {
				on: ['mon'],
				choices,
				items: [{ when: { place: 'wfh' }, items: [{ use: 'morning', time: '08:00' }] }]
			}
		}
	};
	it('omits inherited and matching nested conditions while retaining unrelated and conflicting ones', () => {
		const before = structuredClone(routine);
		const items = outlineDay(routine, 'day', { place: 'wfh' }).items;
		expect(items.map((i) => i.conditions)).toEqual([['Gym on', 'Mon'], ['Place: Office'], []]);
		expect(items.map((i) => i.title)).toEqual(['Exercise', 'Office only', 'Not office']);
		expect(routine).toEqual(before);
	});
	it('preserves all labels when no enclosing choice is provided', () => {
		expect(outlineDay(routine, 'day').items[0].conditions).toContain('Place: WFH');
	});
	it('also omits a toggle already explained by the selected branch', () => {
		expect(outlineDay(routine, 'day', { place: 'wfh', gym: true }).items[0].conditions).toEqual(['Mon']);
	});
});
