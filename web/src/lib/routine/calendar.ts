import { addDays } from './date.ts';
import type { ResolvedItem } from './resolve.ts';
import { timelineEnd } from './timeline.ts';

/** Local wall-clock timestamps plus ctz preserve the schedule's time zone in Calendar. */
function timestamp(date: string, minute: number): string {
	const day = addDays(date, Math.floor(minute / 1440)).replaceAll('-', '');
	const clock = minute % 1440;
	return `${day}T${String(Math.floor(clock / 60)).padStart(2, '0')}${String(clock % 60).padStart(2, '0')}00`;
}

/** A draft only: Google Calendar asks the user to choose a calendar and save. */
export function googleCalendarUrl(
	date: string,
	items: ResolvedItem[],
	title = items[0]?.title,
	timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
): string | undefined {
	const end = timelineEnd(items);
	if (!title || end === undefined) return undefined;
	const start = items[0].sortKey;
	const details = eventDetails(items, title);
	const url = new URL('https://calendar.google.com/calendar/render');
	url.search = new URLSearchParams({
		action: 'TEMPLATE',
		text: title,
		dates: `${timestamp(date, start)}/${timestamp(date, end)}`,
		ctz: timeZone,
		...(details ? { details } : {})
	}).toString();
	return url.toString();
}

function eventDetails(items: ResolvedItem[], title: string): string {
	return items
		.map((item) =>
			[
				...(items.length > 1 || title !== item.title ? [`${item.title} · ${item.duration} min`] : []),
				item.note,
				...item.links.map((link) => link.url)
			]
				.filter(Boolean)
				.join('\n')
		)
		.filter(Boolean)
		.join('\n\n');
}
