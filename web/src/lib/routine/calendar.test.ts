import { describe, expect, it } from 'vitest';
import { googleCalendarUrl } from './calendar.ts';
import { resolveDay, type ResolvedItem } from './resolve.ts';
import { groupTimeline } from './timeline.ts';
import type { Routine } from './types.ts';

const routine: Routine = {
	settings: { automatic_swedish_holidays: false },
	blocks: {
		morning: {
			name: 'Morning',
			items: [
				{
					title: 'Breakfast',
					duration: 15,
					note: 'Coffee & toast',
					link: 'https://example.com/recipe?a=1&b=2'
				},
				{ title: 'Get ready', duration: 10 }
			]
		}
	},
	templates: {
		daily: {
			on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
			items: [
				{ use: 'morning', time: '07:00' },
				{ title: 'Walk & relax ☀', time: '23:50', duration: 30, note: 'Outside\nBring a jacket' }
			]
		}
	}
};
const items = (date: string) => resolveDay(routine, date).items;
const params = (date: string, entries: ResolvedItem[], title?: string) =>
	new URL(googleCalendarUrl(date, entries, title, 'Europe/Stockholm')!).searchParams;

describe('Google Calendar draft links', () => {
	it('encodes activity details and uses the viewed date and local time zone', () => {
		const entry = items('2026-11-18')[0];
		const url = new URL(googleCalendarUrl('2026-11-18', [entry], undefined, 'Europe/Stockholm')!);
		expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
		expect(url.searchParams.get('action')).toBe('TEMPLATE');
		expect(url.searchParams.get('dates')).toBe('20261118T070000/20261118T071500');
		expect(url.searchParams.get('ctz')).toBe('Europe/Stockholm');
		expect(url.searchParams.get('details')).toBe('Coffee & toast\nhttps://example.com/recipe?a=1&b=2');
		expect(url.searchParams.get('text')).toBe('Breakfast');
	});
	it('exports a shared block as one event spanning its resolved activities', () => {
		const group = groupTimeline(items('2026-11-18'))[0];
		const result = params('2026-11-18', group.items, group.name);
		expect(result.get('text')).toBe('Morning');
		expect(result.get('dates')).toBe('20261118T070000/20261118T072500');
		expect(result.get('details')).toContain('Breakfast · 15 min');
		expect(result.get('details')).toContain('Get ready · 10 min');
	});
	it('rolls an end time across midnight, including month boundaries', () => {
		const result = params('2026-11-30', [items('2026-11-30')[2]]);
		expect(result.get('text')).toBe('Walk & relax ☀');
		expect(result.get('dates')).toBe('20261130T235000/20261201T002000');
	});
	it('places after-midnight activities on the next civil date of the logical day', () => {
		const entry = { ...items('2026-12-31')[0], time: '01:00', sortKey: 1500 };
		expect(params('2026-12-31', [entry]).get('dates')).toBe('20270101T010000/20270101T011500');
	});
	it('keeps local wall times and the named time zone on daylight-saving dates', () => {
		expect(params('2026-03-29', [items('2026-03-29')[0]]).get('dates')).toBe(
			'20260329T070000/20260329T071500'
		);
	});
	it('does not invent times for untimed activities or blocks', () => {
		expect(googleCalendarUrl('2026-11-18', [])).toBeUndefined();
		expect(googleCalendarUrl('2026-11-18', [{ ...items('2026-11-18')[0], time: undefined }])).toBeUndefined();
	});
});
