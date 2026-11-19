import { describe, expect, it } from 'vitest';
import { newBranch, branchOptions } from './branches.ts';
import { resolveDay } from './resolve.ts';
import { sortRoutineByTime } from './edit.ts';
import { validateRoutine } from './validate.ts';
import schema from '../../../../routine.schema.json';
import type { Routine, Choice, ItemDef } from './types.ts';
const location: Choice = {
	label: 'Location',
	options: { home: { label: 'Home' }, office: { label: 'Office' } },
	default: 'home'
};
const activity = (title: string, time = '08:00'): ItemDef => ({ title, time, duration: 10 });
const fixture: Routine = {
	days: {
		day: {
			on: ['mon'],
			choices: {
				later: { label: 'Evening', options: { out: {}, stay: {} }, default: 'out' },
				gym: { options: { train: {}, rest: {} }, default: 'train' },
				location
			},
			items: [
				activity('Breakfast', '07:00'),
				{
					alternative: 'location',
					paths: {
						home: [
							activity('Work at home'),
							{ alternative: 'gym', paths: { train: [activity('Lift', '17:00')], rest: [] } }
						],
						office: [activity('Commute')]
					}
				},
				activity('Dinner', '19:00'),
				{ alternative: 'later', paths: { out: [activity('Go out', '20:00')], stay: [] } }
			]
		}
	}
};
describe('explicit forks', () => {
	it('creates detached empty paths for named options', () => {
		const branch = newBranch('location', location);
		expect(branch).toEqual({ alternative: 'location', paths: { home: [], office: [] } });
		branch.paths.home.push(activity('Home'));
		expect(branch.paths.office).toEqual([]);
		expect(branchOptions(location)).toEqual([
			{ value: 'home', label: 'Home' },
			{ value: 'office', label: 'Office' }
		]);
	});
	it('resolves children only inside the selected parent and leaves later forks independent', () => {
		const before = structuredClone(fixture);
		const home = resolveDay(fixture, '2026-11-16');
		expect(home.items.map((i) => i.title)).toEqual(['Breakfast', 'Work at home', 'Lift', 'Dinner', 'Go out']);
		expect(home.choices.map((c) => c.name)).toEqual(['location', 'gym', 'later']);
		const office = resolveDay(fixture, '2026-11-16', {
			choices: { location: 'office', gym: 'rest', later: 'out' }
		});
		expect(office.items.map((i) => i.title)).toEqual(['Breakfast', 'Commute', 'Dinner', 'Go out']);
		expect(office.choices.map((c) => c.name)).toEqual(['location', 'later']);
		expect(fixture).toEqual(before);
	});
	it('empty and missing paths continue the routine without placeholder activities', () => {
		const empty = resolveDay(fixture, '2026-11-16', { choices: { gym: 'rest', later: 'stay' } });
		expect(empty.items.map((i) => i.title)).toEqual(['Breakfast', 'Work at home', 'Dinner']);
		const partial = structuredClone(fixture);
		const fork = partial.days.day.items[3];
		if (!('paths' in fork)) throw Error();
		delete fork.paths.stay;
		expect(
			resolveDay(partial, '2026-11-16', { choices: { later: 'stay' } }).items.some(
				(i) => i.title === 'Go out'
			)
		).toBe(false);
		expect(validateRoutine(partial, schema)).toEqual([]);
	});
	it('keeps source paths pointing at the selected option and nested activity', () => {
		const home = resolveDay(fixture, '2026-11-16');
		expect(home.items.find((i) => i.title === 'Lift')!.source).toEqual({ path: [1, 0, 1, 0, 0] });
		expect(
			resolveDay(fixture, '2026-11-16', { choices: { location: 'office' } }).items.find(
				(i) => i.title === 'Commute'
			)!.source
		).toEqual({ path: [1, 1, 0] });
	});
	it('sorts each path independently and keeps the complete fork together', () => {
		const copy = structuredClone(fixture);
		const fork = copy.days.day.items[1];
		if (!('paths' in fork)) throw Error();
		fork.paths.office = [activity('Late', '10:00'), activity('Early', '08:00')];
		const sorted = sortRoutineByTime(copy);
		const ordered = sorted.days.day.items[1];
		if (!('paths' in ordered)) throw Error();
		expect(ordered.paths.office.map((i) => ('title' in i ? i.title : ''))).toEqual(['Early', 'Late']);
		expect(fork.paths.office[0]).toHaveProperty('title', 'Late');
	});
	it('rejects unknown alternatives, unknown option paths, rules and recursive alternatives', () => {
		expect(validateRoutine(fixture, schema)).toEqual([]);
		for (const branch of [
			{ alternative: 'missing', paths: {} },
			{ alternative: 'location', paths: { missing: [] } },
			{ when: { location: 'home' }, items: [] },
			{ alternative: 'location', paths: { home: [newBranch('location', location)] } }
		]) {
			const copy = structuredClone(fixture);
			copy.days.day.items = [branch as never];
			expect(validateRoutine(copy, schema).length).toBeGreaterThan(0);
		}
		const copy = structuredClone(fixture);
		Object.assign(copy.days.day.choices!.location, { active_when: { gym: 'train' } });
		expect(validateRoutine(copy, schema).length).toBeGreaterThan(0);
	});
	it('ignores the order of alternative definitions', () => {
		const copy = structuredClone(fixture);
		copy.days.day.choices = Object.fromEntries(Object.entries(copy.days.day.choices!).reverse());
		expect(resolveDay(copy, '2026-11-16')).toEqual(resolveDay(fixture, '2026-11-16'));
	});
});
