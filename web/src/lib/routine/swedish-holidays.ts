import { addDays } from './date.ts';

/** Easter Sunday of `year` in the Gregorian calendar. */
function easterSunday(year: number): string {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The first `dayOfWeek` (1 = Monday … 7 = Sunday) on or after `date`. */
function nextOrSame(date: string, dayOfWeek: number): string {
	const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
	return addDays(date, (dayOfWeek - weekday + 7) % 7);
}

const SATURDAY = 6;

/** Sweden's public holidays in `year`, by calendar date, with their Swedish names. */
function swedishPublicHolidays(year: number): Map<string, string> {
	const easter = easterSunday(year);
	const date = (month: number, day: number) =>
		`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	const holidays: [string, string][] = [
		[date(1, 1), 'Nyårsdagen'],
		[date(1, 6), 'Trettondedag jul'],
		[addDays(easter, -2), 'Långfredagen'],
		[easter, 'Påskdagen'],
		[addDays(easter, 1), 'Annandag påsk'],
		[date(5, 1), 'Första maj'],
		[addDays(easter, 39), 'Kristi himmelsfärdsdag'],
		[addDays(easter, 49), 'Pingstdagen'],
		[date(6, 6), 'Sveriges nationaldag'],
		[nextOrSame(date(6, 20), SATURDAY), 'Midsommardagen'],
		[nextOrSame(date(10, 31), SATURDAY), 'Alla helgons dag'],
		[date(12, 25), 'Juldagen'],
		[date(12, 26), 'Annandag jul']
	];
	return new Map(holidays);
}

/**
 * The Swedish name of the public holiday on `calendarDate`, or undefined on any other day,
 * including ordinary Sundays.
 */
export function getSwedishPublicHolidayName(calendarDate: string): string | undefined {
	const parsed = new Date(`${calendarDate}T00:00:00Z`);
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate) ||
		!Number.isFinite(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== calendarDate
	) {
		throw new RangeError(`Not a calendar date: '${calendarDate}'`);
	}
	const year = parsed.getUTCFullYear();
	return swedishPublicHolidays(year).get(calendarDate);
}
