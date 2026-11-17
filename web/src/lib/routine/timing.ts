import { toMinutes } from './date.ts';
import type { ItemDef } from './types.ts';

export function endTime(item: ItemDef): string | undefined {
	if (!item.time || !item.duration) return undefined;
	const total = (toMinutes(item.time) + item.duration) % 1440;
	return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Anchor an expanded block and place untimed items after the preceding item's end. */
export function scheduleBlock<T extends ItemDef>(
	items: T[],
	start?: string
): (T & { time?: string; end?: string })[] {
	let cursor = start;
	return items.map((item) => {
		const placed: T & { end?: string } = { ...item };
		if (!placed.time && cursor) placed.time = cursor;
		const end = endTime(placed);
		if (end) placed.end = end;
		cursor = end;
		return placed;
	});
}
