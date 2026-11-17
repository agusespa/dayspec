import { describe, expect, it } from 'vitest';
import { getSwedishPublicHolidayName } from './swedish-holidays.ts';
const isSwedishPublicHoliday = (date: string) => getSwedishPublicHolidayName(date) !== undefined;
function holidaysIn(year: number): string[] {
	const holidays: string[] = [];
	for (let day = new Date(Date.UTC(year, 0, 1)); day.getUTCFullYear() === year;) {
		const date = day.toISOString().slice(0, 10);
		if (isSwedishPublicHoliday(date)) holidays.push(date);
		day = new Date(day.getTime() + 86400000);
	}
	return holidays;
}
describe('getSwedishPublicHolidayName', () => {
	it('lists every public holiday of a year', () => {
		expect(holidaysIn(2026)).toEqual([
			'2026-01-01',
			'2026-01-06',
			'2026-04-03',
			'2026-04-05',
			'2026-04-06',
			'2026-05-01',
			'2026-05-14',
			'2026-05-24',
			'2026-06-06',
			'2026-06-20',
			'2026-10-31',
			'2026-12-25',
			'2026-12-26'
		]);
	});
	it.each([
		['2024-03-31'],
		['2025-04-20'],
		['2027-03-28'],
		// The earliest and latest dates Easter can fall on.
		['2285-03-22'],
		['2038-04-25'],
		// Century years, where the Gregorian corrections change.
		['2100-03-28'],
		['2200-04-06']
	])('places Easter Sunday on %s', (easter) => {
		expect(getSwedishPublicHolidayName(easter)).toBe('Påskdagen');
	});
	it('moves Midsummer Day and All Saints’ Day to the Saturday in their week', () => {
		expect(isSwedishPublicHoliday('2027-06-26')).toBe(true);
		expect(isSwedishPublicHoliday('2027-06-20')).toBe(false);
		expect(isSwedishPublicHoliday('2027-11-06')).toBe(true);
		expect(isSwedishPublicHoliday('2027-10-31')).toBe(false);
	});
	it('does not count the eves, which are not public holidays', () => {
		expect(isSwedishPublicHoliday('2026-06-19')).toBe(false);
		expect(isSwedishPublicHoliday('2026-12-24')).toBe(false);
		expect(isSwedishPublicHoliday('2026-12-31')).toBe(false);
	});
	it('names the holiday', () => {
		expect(getSwedishPublicHolidayName('2026-12-25')).toBe('Juldagen');
		expect(getSwedishPublicHolidayName('2026-06-20')).toBe('Midsommardagen');
		expect(getSwedishPublicHolidayName('2026-06-19')).toBeUndefined();
	});
	it('rejects a value that is not a calendar date', () => {
		expect(() => getSwedishPublicHolidayName('2026-02-30')).toThrow(RangeError);
	});
});
