/**
 * Per-date state in localStorage: choice overrides and the holiday flag.
 * Storage can be unavailable (private browsing, cleared site data), so every access is guarded
 * and the app falls back to the routine's defaults.
 */
import type { ChoiceValue } from '#lib/routine/types.ts';

export interface StoredDay {
	choices: Record<string, ChoiceValue>;
	/** Absent follows the Swedish holiday calendar; either boolean is a manual override. */
	holiday?: boolean;
}

const key = (date: string) => `dayspec:day:${date}`;

export function loadDay(date: string): StoredDay {
	const day: StoredDay = { choices: {} };
	try {
		const raw = localStorage.getItem(key(date));
		if (!raw) return day;
		const saved = JSON.parse(raw);
		if (saved && typeof saved === 'object') {
			if (saved.choices && typeof saved.choices === 'object' && !Array.isArray(saved.choices)) {
				day.choices = Object.fromEntries(
					Object.entries(saved.choices).filter(
						([, value]) => typeof value === 'string' || typeof value === 'boolean'
					)
				) as Record<string, ChoiceValue>;
			}
			if (typeof saved.holiday === 'boolean') day.holiday = saved.holiday;
		}
	} catch {
		// Unreadable or unavailable: start from the defaults.
	}
	return day;
}

export function saveDay(date: string, day: StoredDay): void {
	try {
		if (Object.keys(day.choices).length === 0 && day.holiday === undefined) {
			localStorage.removeItem(key(date));
		} else {
			localStorage.setItem(key(date), JSON.stringify({ choices: day.choices, holiday: day.holiday }));
		}
	} catch {
		// Not saved; the page keeps working for this session.
	}
}
