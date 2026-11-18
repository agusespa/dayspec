import { describe, expect, it } from 'vitest';
import { branchOptions, inBranch, moveSection, newBranch, timelineSections, branchView } from './branches.ts';
import schema from '../../../../routine.schema.json';
import { validateRoutine } from './validate.ts';
import { resolveDay } from './resolve.ts';
import type { Choice, Entry, Routine } from './types.ts';

const location: Choice = {
	label: 'Work location',
	options: { home: { label: 'Home' }, office: { label: 'Office' } },
	default: 'home'
};
const choices = { location, gym: { type: 'toggle', default: false } satisfies Choice };
const item = (title: string, when?: Entry['when']): Entry => ({
	title,
	duration: 5,
	...(when ? { when } : {})
});

describe('template branches', () => {
	it('keeps common activities and repeated decision points in their original positions', () => {
		const entries = [
			item('Breakfast'),
			item('Home', { location: 'home' }),
			item('Office', { location: 'office' }),
			item('Lunch'),
			item('Home evening', { location: 'home' }),
			item('Gym', { gym: true })
		];
		const before = structuredClone(entries);
		expect(timelineSections(entries, choices)).toEqual([
			{ start: 0, indices: [0], choice: undefined },
			{ start: 1, indices: [1, 2], choice: 'location' },
			{ start: 3, indices: [3], choice: undefined },
			{ start: 4, indices: [4], choice: 'location' },
			{ start: 5, indices: [5], choice: 'gym' }
		]);
		expect(entries).toEqual(before);
	});
	it('handles groups, inherited decisions and combined conditions without dropping them', () => {
		const entry: Entry = { when: { location: 'office', gym: true, days: ['mon'] }, items: [item('Lift')] };
		expect(timelineSections([entry], choices)[0].choice).toBe('location');
		expect(timelineSections([entry], choices, ['location'])[0].choice).toBe('gym');
		expect(inBranch(entry, 'location', 'office')).toBe(true);
		expect(inBranch(entry, 'location', 'home')).toBe(false);
		expect(entry.when).toEqual({ location: 'office', gym: true, days: ['mon'] });
	});
	it('matches option sets, exclusions and both toggle values using the resolver rules', () => {
		expect(inBranch(item('Both', { location: ['home', 'office'] }), 'location', 'home')).toBe(true);
		expect(inBranch(item('Outside', { location: { not: 'home' } }), 'location', 'office')).toBe(true);
		expect(inBranch(item('Outside', { location: { not: 'home' } }), 'location', 'home')).toBe(false);
		expect(inBranch(item('Rest', { gym: false }), 'gym', false)).toBe(true);
		expect(inBranch(item('Rest', { gym: false }), 'gym', true)).toBe(false);
	});
	it('does not treat weekday-only conditions or unknown choices as decisions', () => {
		expect(
			timelineSections([item('Monday', { days: ['mon'] }), item('Unknown', { missing: true })], choices)
		).toEqual([{ start: 0, indices: [0, 1], choice: undefined }]);
	});
	it('creates independent, empty alternative groups for selects and toggles', () => {
		expect(branchOptions(location)).toEqual([
			{ value: 'home', label: 'Home' },
			{ value: 'office', label: 'Office' }
		]);
		expect(newBranch('location', location)).toEqual([
			{ when: { location: 'home' }, items: [] },
			{ when: { location: 'office' }, items: [] }
		]);
		expect(newBranch('gym', choices.gym)).toEqual([
			{ when: { gym: true }, items: [] },
			{ when: { gym: false }, items: [] }
		]);
	});
	it('moves both alternatives together past neighbouring activities without mutating data', () => {
		const entries = [
			item('Before'),
			item('Home', { location: 'home' }),
			item('Office', { location: 'office' }),
			item('After')
		];
		const sections = timelineSections(entries, choices);
		expect(moveSection(entries, sections, 1, -1)).toEqual([entries[1], entries[2], entries[0], entries[3]]);
		expect(moveSection(entries, sections, 1, 1)).toEqual([entries[0], entries[3], entries[1], entries[2]]);
		expect(moveSection(entries, sections, 0, -1)).toBe(entries);
		expect(moveSection(entries, sections, 3, 1)).toBe(entries);
		expect(entries[0]).toEqual(item('Before'));
	});
});

it('validates empty alternatives and resolves them without phantom activities', () => {
	const routine: Routine = {
		days: {
			day: {
				on: ['mon'],
				choices: { gym: choices.gym },
				items: [
					{ when: { gym: true }, items: [item('Lift')] },
					{ when: { gym: false }, items: [] }
				]
			}
		}
	};
	expect(validateRoutine(routine, schema)).toEqual([]);
	expect(resolveDay(routine, '2026-11-16', { choices: { gym: false } }).items).toEqual([]);
	expect(resolveDay(routine, '2026-11-16', { choices: { gym: true } }).items.map((i) => i.title)).toEqual([
		'Lift'
	]);
});

it('collects work alternatives even when dependent evening choices are stored between them', () => {
	const entries = [
		item('Breakfast'),
		item('Office morning', { location: 'office' }),
		item('Lift', { gym: true }),
		item('Home morning', { location: 'home' }),
		item('Rest', { gym: false }),
		item('Dinner')
	];
	const before = structuredClone(entries);
	const sections = timelineSections(entries, choices);
	expect(sections.map((s) => s.indices)).toEqual([[0], [1, 3], [2, 4], [5]]);
	expect(moveSection(entries, sections, 1, 1)).toEqual([
		entries[0],
		entries[2],
		entries[4],
		entries[1],
		entries[3],
		entries[5]
	]);
	expect(entries).toEqual(before);
});

describe('scoped alternative previews', () => {
	const localChoices: Record<string, Choice> = {
		location,
		evening: { options: { dance: {}, workshop: {} }, default: 'dance', active_when: { location: 'office' } },
		gym: { type: 'toggle', default: true, active_when: { location: 'home' } },
		later: { type: 'toggle', default: false }
	};
	const entries: Entry[] = [
		item('Breakfast'),
		item('Office work', { location: 'office' }),
		item('Dance', { evening: 'dance' }),
		item('Workshop', { evening: 'workshop' }),
		item('Home work', { location: 'home' }),
		item('Lift', { gym: true }),
		item('Shared evening', { evening: { not: 'workshop' } }),
		item('Dinner'),
		item('Go out', { later: true }),
		item('Stay in', { later: false })
	];
	it('groups dependent choices under their parent and leaves later independent choices separate', () => {
		expect(branchView(entries, localChoices).sections.map((s) => s.choice)).toEqual([
			undefined,
			'location',
			undefined,
			'later'
		]);
	});
	it('shows Evening inside Office and Gym inside Home, without changing the original entries', () => {
		const before = structuredClone(entries);
		const selected = entries.slice(1, 7);
		const office = branchView(selected, localChoices, { location: 'office' });
		const home = branchView(selected, localChoices, { location: 'home' });
		expect(office.sections.map((s) => s.choice)).toEqual([undefined, 'evening']);
		expect(home.sections.map((s) => s.choice)).toEqual([undefined, 'gym', undefined]);
		expect(home.entries.map((e) => ('title' in e ? e.title : ''))).toContain('Shared evening');
		expect(office.entries.map((e) => ('title' in e ? e.title : ''))).not.toContain('Lift');
		expect(home.entries.map((e) => ('title' in e ? e.title : ''))).not.toContain('Dance');
		expect(entries).toEqual(before);
	});
	it('keeps a shared continuation when a dependent choice is inactive and scopes exclusions to active children', () => {
		const dance = branchView(entries.slice(1, 7), localChoices, { location: 'office', evening: 'dance' });
		const workshop = branchView(entries.slice(1, 7), localChoices, {
			location: 'office',
			evening: 'workshop'
		});
		expect(dance.entries.map((e) => ('title' in e ? e.title : ''))).toContain('Shared evening');
		expect(workshop.entries.map((e) => ('title' in e ? e.title : ''))).not.toContain('Shared evening');
		expect(branchView(entries.slice(8), localChoices).sections[0].choice).toBe('later');
	});
	it('scopes nested groups as well as direct activities', () => {
		const nested: Entry[] = [
			{
				when: { location: 'office' },
				items: [item('Office'), { when: { gym: true }, items: [item('Wrong child')] }]
			}
		];
		const result = branchView(nested, localChoices, { location: 'office' });
		expect(result.entries).toEqual([item('Office')]);
	});
});

it('keeps an unrelated extra condition as a label rather than inventing a child decision', () => {
	const choices: Record<string, Choice> = { location, gym: { type: 'toggle', default: true } };
	const view = branchView([item('Lift', { gym: true, location: 'office' })], choices, { gym: true });
	expect(view.sections.map((s) => s.choice)).toEqual([undefined]);
	expect(view.entries[0].when).toEqual({ location: 'office' });
});
