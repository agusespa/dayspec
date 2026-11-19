/** Acceptance cases use a test-only routine; the shipped default starts empty. */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRoutine } from '../../../routine-plugin.ts';
import { outlineDay } from './outline.ts';
import { resolveDay, type ResolvedDay } from './resolve.ts';
import type { Routine } from './types.ts';
import schema from '../../../../routine.schema.json';
import { validateRoutine } from './validate.ts';
const routine = loadRoutine(
	new URL('../../../../e2e/fixtures/routine.json', import.meta.url).pathname
) as Routine;
// A week in November 2026: Monday the 16th to Sunday the 22nd.
const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';
const FRI = '2026-11-20';
const SAT = '2026-11-21';
const SUN = '2026-11-22';
const titles = (day: ResolvedDay) => day.items.map((i) => i.title);
const choice = (day: ResolvedDay, name: string) => day.choices.find((c) => c.name === name)?.value;
const SHARED_EVENING = [
	'Cook dinner',
	"Dishes, prepare tomorrow's food — Log",
	'Learn music',
	'Meditation',
	'Light reading'
];
describe('routine fixture', () => {
	it('accepts the routine fixture', () => {
		expect(validateRoutine(routine, schema)).toEqual([]);
	});
	it('Tuesday, office, dance class', () => {
		const day = resolveDay(routine, TUE, { choices: { location: 'office', evening: 'dance_class' } });
		expect(day.theme).toBe('Career + Personal Development');
		expect(day.items.find((i) => i.time === '07:25')?.note).toContain('Body trimming');
		const all = titles(day);
		expect(all).toContain('Get ready for work! Check train times & weather');
		expect(all).toContain('Dance class');
		for (const t of SHARED_EVENING) expect(all).toContain(t);
		// The dance class evening comes before the shared evening.
		expect(all.indexOf('Dance class')).toBeLessThan(all.indexOf('Cook dinner'));
		expect(all).not.toContain('Daily news pods, Swedish news, Personal Development');
	});
	it('Wednesday defaults to WFH with the gym selected and grooming notes', () => {
		const day = resolveDay(routine, WED);
		expect(choice(day, 'location')).toBe('wfh');
		expect(choice(day, 'gym')).toBe('yes');
		expect(day.choices.map((c) => c.name)).not.toContain('evening');
		expect(day.items.find((i) => i.time === '08:00')?.note).toContain('Facial hair');
		expect(titles(day)).toContain('Dress — go to gym — Strength training (55′)');
		const off = resolveDay(routine, WED, { choices: { gym: 'no' } });
		expect(titles(off)).not.toContain('Dress — go to gym — Strength training (55′)');
		for (const t of SHARED_EVENING) expect(titles(off)).toContain(t);
	});
	it('Monday workshop replaces the shared evening', () => {
		const day = resolveDay(routine, MON, { choices: { evening: 'workshop' } });
		expect(titles(day)).toContain('Dance workshop + social');
		for (const t of SHARED_EVENING) expect(titles(day)).not.toContain(t);
	});
	it('offers the workshop on Mondays only', () => {
		const options = (date: string) =>
			resolveDay(routine, date, { choices: { location: 'office' } })
				.choices.find((c) => c.name === 'evening')
				?.options.map((o) => o.value);
		expect(options(MON)).toContain('workshop');
		expect(options(TUE)).not.toContain('workshop');
		// A stored workshop choice on another day falls back to the default.
		const tue = resolveDay(routine, TUE, { choices: { evening: 'workshop' } });
		expect(choice(tue, 'evening')).toBe('dance_class');
	});
	it('Friday ends after lunch unless there are evening plans', () => {
		expect(titles(resolveDay(routine, FRI)).at(-1)).toBe('Make lunch');
		const out = resolveDay(routine, FRI, { choices: { evening: 'going_out' } });
		expect(titles(out).at(-1)).toBe('Commute to city');
	});
	it('Saturday sorts lucid dreaming after midnight last', () => {
		const day = resolveDay(routine, SAT);
		expect(day.theme).toBe('Projects');
		expect(titles(day).at(-1)).toBe('Lucid dreaming');
		expect(day.items.some((i) => i.note?.includes('Head shaving'))).toBe(false);
		expect(
			resolveDay(routine, SAT, { choices: { going_out: 'going_out' } }).items.some((i) =>
				i.note?.includes('Head shaving')
			)
		).toBe(true);
	});
	it('a holiday uses the Saturday template on any date', () => {
		const day = resolveDay(routine, TUE, { holiday: true });
		expect(day.template).toBe('saturday');
		expect(day.theme).toBe('Projects');
	});
	it('Sunday orders activities by their explicit start times', () => {
		const all = titles(resolveDay(routine, SUN));
		expect(all.indexOf('Personal Development')).toBe(all.indexOf('Breakfast + magazine articles') + 1);
		expect(all.at(-1)).toBe('Light reading');
	});
	it('the weekday template shows every variant with its conditions', () => {
		const day = outlineDay(routine, 'weekday');
		const find = (time: string, title: string) => day.items.find((i) => i.time === time && i.title === title);
		expect(find('07:25', 'Bathroom, shower + grooming')?.note).toContain('Back trimming');
		const location = day.choices.find((c) => c.name === 'location');
		expect(location?.options.map((o) => [o.label, o.defaultOn])).toEqual([
			['Office', ['mon', 'tue', 'thu']],
			['WFH', ['wed']]
		]);
	});
	it('every template can be outlined', () => {
		for (const key of Object.keys(routine.days))
			expect(outlineDay(routine, key).items.length).toBeGreaterThan(0);
	});
});
describe('JSON routine loading', () => {
	it('rejects malformed JSON and invalid routine references', () => {
		const dir = mkdtempSync(join(tmpdir(), 'dayspec-json-'));
		const path = join(dir, 'routine.json');
		try {
			writeFileSync(path, '{');
			expect(() => loadRoutine(path)).toThrow(SyntaxError);
			writeFileSync(path, JSON.stringify({ ...routine, settings: { holiday: 'missing' } }));
			expect(() => loadRoutine(path)).toThrow('there is no day template "missing"');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
it('ships an empty routine that resolves safely on weekdays, weekends and holidays', () => {
	const empty = loadRoutine() as Routine;
	expect(empty.blocks).toBeUndefined();
	for (const date of [MON, TUE, WED, FRI, SAT, SUN]) {
		expect(resolveDay(empty, date).items).toEqual([]);
		expect(resolveDay(empty, date, { holiday: true }).items).toEqual([]);
	}
	expect(Object.keys(empty.days)).toEqual(['daily']);
	expect(outlineDay(empty, 'daily').items).toEqual([]);
});
