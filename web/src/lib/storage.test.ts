import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { loadDay, saveDay } from './storage.ts';

const date = '2026-12-25';
const key = `dayspec:day:${date}`;
let values: Map<string, string>;
beforeEach(() => {
	values = new Map();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key)
	});
});
afterEach(() => vi.unstubAllGlobals());

describe('holiday overrides', () => {
	it('defaults to automatic without saving a calculated holiday', () => {
		expect(loadDay(date).holiday).toBeUndefined();
		saveDay(date, loadDay(date));
		expect(values.has(key)).toBe(false);
	});
	it.each([true, false])('persists an explicit %s even without other state', (holiday) => {
		saveDay(date, { choices: {}, holiday });
		expect(loadDay(date).holiday).toBe(holiday);
	});
	it('clears an override without removing choices', () => {
		saveDay(date, { choices: { work: { gym: 'yes' } }, holiday: false });
		const day = loadDay(date);
		delete day.holiday;
		saveDay(date, day);
		expect(loadDay(date)).toEqual({ choices: { work: { gym: 'yes' } } });
	});
	it('removes storage when the final override is cleared', () => {
		saveDay(date, { choices: {}, holiday: false });
		saveDay(date, { choices: {} });
		expect(values.has(key)).toBe(false);
	});
	it('falls back to automatic if storage is corrupt or unavailable', () => {
		values.set(key, '{');
		expect(loadDay(date).holiday).toBeUndefined();
		vi.stubGlobal('localStorage', {
			getItem() {
				throw new Error('blocked');
			},
			setItem() {
				throw new Error('blocked');
			}
		});
		expect(loadDay(date).holiday).toBeUndefined();
		expect(() => saveDay(date, { choices: {}, holiday: false })).not.toThrow();
	});
});

it('keeps only supported choice values from browser storage', () => {
	values.set(
		key,
		JSON.stringify({
			choices: {
				work: { place: 'home', gym: 'no', invalid: true, count: 3 },
				rest: { place: 'office' },
				enabled: true,
				disabled: false,
				count: 3,
				nested: {},
				empty: null,
				list: []
			}
		})
	);
	expect(loadDay(date)).toEqual({
		choices: { work: { place: 'home', gym: 'no' }, rest: { place: 'office' }, nested: {} }
	});
	for (const choices of [[], ['home'], null, 'home']) {
		values.set(key, JSON.stringify({ choices }));
		expect(loadDay(date).choices).toEqual({});
	}
});

it('keeps independent selections for templates sharing the same choice and option IDs', () => {
	const day = { choices: { work: { choice: 'option_2' }, rest: { choice: 'option' } }, holiday: true };
	saveDay(date, day);
	expect(loadDay(date)).toEqual(day);
	const saved = loadDay(date);
	saved.choices.rest.choice = 'option_2';
	saveDay(date, saved);
	expect(loadDay(date).choices.work.choice).toBe('option_2');
});
