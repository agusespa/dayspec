/** Dates are local calendar dates as YYYY-MM-DD strings; times are HH:MM. */
import { WEEKDAYS, type Weekday } from './types.ts';

const MINUTES_PER_DAY = 24 * 60;

function utc(date: string): Date {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): Weekday {
	// getUTCDay: 0 is Sunday.
	return WEEKDAYS[(utc(date).getUTCDay() + 6) % 7];
}

export function addDays(date: string, days: number): string {
	const d = utc(date);
	d.setUTCDate(d.getUTCDate() + days);
	return iso(d);
}

export function toMinutes(time: string): number {
	const [h, m] = time.split(':').map(Number);
	return h * 60 + m;
}

/** Minutes since midnight, with times before the day starts counted as after midnight. */
export function dayMinutes(time: string, dayStartsAt: string): number {
	const minutes = toMinutes(time);
	return minutes < toMinutes(dayStartsAt) ? minutes + MINUTES_PER_DAY : minutes;
}

function localDate(now: Date): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** The date the app treats as today: before `dayStartsAt` it is still the previous day. */
export function logicalToday(now: Date, dayStartsAt: string): string {
	const today = localDate(now);
	return now.getHours() * 60 + now.getMinutes() < toMinutes(dayStartsAt) ? addDays(today, -1) : today;
}

/** The current time on the logical day's clock (see dayMinutes). */
export function logicalNow(now: Date, dayStartsAt: string): number {
	const minutes = now.getHours() * 60 + now.getMinutes();
	return minutes < toMinutes(dayStartsAt) ? minutes + MINUTES_PER_DAY : minutes;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** "Tuesday 17 November 2026" or "Tue 17 Nov". Spelled out here so it never depends on the locale. */
export function formatDate(date: string, style: 'long' | 'short'): string {
	const d = utc(date);
	const day = DAY_NAMES[(d.getUTCDay() + 6) % 7];
	const month = MONTH_NAMES[d.getUTCMonth()];
	return style === 'long'
		? `${day} ${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`
		: `${day.slice(0, 3)} ${d.getUTCDate()} ${month.slice(0, 3)}`;
}
