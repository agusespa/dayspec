import {
	CATEGORY_COLORS,
	WEEKDAYS,
	type CategoryColor,
	type Weekday,
	type Entry,
	type Routine
} from './types.ts';

/** A detached draft so cancel and failed saves never mutate the active routine. */
export function cloneRoutine(routine: Routine): Routine {
	return JSON.parse(JSON.stringify(routine)) as Routine;
}

export function moveEntry(entries: Entry[], index: number, direction: -1 | 1): Entry[] {
	const target = index + direction;
	if (index < 0 || index >= entries.length || target < 0 || target >= entries.length) return entries;
	const next = [...entries];
	[next[index], next[target]] = [next[target], next[index]];
	return next;
}

/** New drafts start with a duration that can be adjusted before saving. */
export function newEntry(_routine?: Routine): Entry {
	return { title: 'New item', duration: 5 };
}

/** Display names follow assignments, while keys remain stable for links and holiday settings. */
export function templateName(days: readonly Weekday[]): string {
	const ordered = WEEKDAYS.filter((day) => days.includes(day));
	if (ordered.length === 7) return 'Daily';
	if (ordered.join() === 'mon,tue,wed,thu,fri') return 'Weekdays';
	if (ordered.join() === 'sat,sun') return 'Weekend';
	if (!ordered.length) return 'New template';
	const full = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
	if (ordered.length === 1) return full[WEEKDAYS.indexOf(ordered[0])];
	return ordered.map((day) => day[0].toUpperCase() + day.slice(1)).join(', ');
}

/** Library order follows each template's first assigned day, starting on Monday. */
export function templateKeys(routine: Routine): string[] {
	const firstDay = (key: string) => Math.min(7, ...routine.days[key].on.map((day) => WEEKDAYS.indexOf(day)));
	return Object.keys(routine.days).sort((a, b) => firstDay(a) - firstDay(b));
}

/** Days are available until assigned to a template. */
export function availableDays(routine: Routine, except?: string): Weekday[] {
	return WEEKDAYS.filter(
		(day) =>
			!Object.entries(routine.days).some(([key, template]) => key !== except && template.on.includes(day))
	);
}

export function assignTemplateDays(routine: Routine, key: string, days: Weekday[]): Routine {
	if (!Object.hasOwn(routine.days, key)) throw new Error('Template does not exist.');
	const selected = WEEKDAYS.filter((day) => days.includes(day));
	if (!selected.length) throw new Error('Select at least one day for this template.');
	if (selected.some((day) => !availableDays(routine, key).includes(day)))
		throw new Error('These days already belong to another template. Unselect them there first.');
	const next = cloneRoutine(routine);
	next.days[key].on = selected;
	return next;
}

export function createTemplate(routine: Routine, days: Weekday[]): { routine: Routine; key: string } {
	let key = 'template';
	for (let n = 2; Object.hasOwn(routine.days, key); n++) key = `template_${n}`;
	const next = cloneRoutine(routine);
	next.days[key] = { on: [], items: [] };
	return { routine: assignTemplateDays(next, key, days), key };
}

export function removeTemplate(routine: Routine, key: string): Routine {
	const next = cloneRoutine(routine);
	delete next.days[key];
	if (next.settings?.holiday === key) delete next.settings.holiday;
	return next;
}

/** References must be removed deliberately before deleting a shared block. */
export function blockReferences(routine: Routine, key: string): string[] {
	const references: string[] = [];

	function uses(entries: Entry[]): boolean {
		return entries.some(
			(entry) => ('use' in entry && entry.use === key) || ('items' in entry && uses(entry.items))
		);
	}
	for (const day of Object.values(routine.days)) if (uses(day.items)) references.push(templateName(day.on));
	for (const [name, block] of Object.entries(routine.blocks ?? {}))
		if (name !== key && uses(block.items)) references.push(block.name);

	return references;
}

export function createBlock(routine: Routine, name: string): { routine: Routine; key: string } {
	const label = name.trim();
	if (!label) throw new Error('Enter a block name.');
	let key = 'block';
	for (let n = 2; Object.hasOwn(routine.blocks ?? {}, key); n++) key = `block_${n}`;
	const next = cloneRoutine(routine);
	next.blocks = { ...next.blocks, [key]: { name: label, items: [newEntry()] } };
	return { routine: next, key };
}

export function removeBlock(routine: Routine, key: string): Routine {
	const references = blockReferences(routine, key);
	if (references.length)
		throw new Error(`This block is used by ${references.join(', ')}. Remove those references first.`);
	const next = cloneRoutine(routine);
	if (next.blocks) delete next.blocks[key];
	return next;
}

/** Names are editable; stable IDs and references do not change. */
export function renameBlock(routine: Routine, key: string, name: string): Routine {
	if (!Object.hasOwn(routine.blocks ?? {}, key)) throw new Error('Shared block does not exist.');
	if (!name.trim()) throw new Error('Enter a block name.');
	const next = cloneRoutine(routine);
	next.blocks![key].name = name.trim();
	return next;
}

/** Names of the items and shared blocks in a category, each once, so the editor can say what still uses it. */
export function categoryReferences(routine: Routine, key: string): string[] {
	const titles = new Set<string>();
	const visit = (entries: Entry[]) => {
		for (const entry of entries) {
			if ('items' in entry) visit(entry.items);
			else if ('title' in entry && entry.category === key) titles.add(entry.title);
		}
	};
	for (const day of Object.values(routine.days)) visit(day.items);
	for (const block of Object.values(routine.blocks ?? {})) {
		if (block.category === key) titles.add(block.name);
		visit(block.items);
	}
	return [...titles];
}

/** A new category takes the first palette colour no other category has yet. */
export function createCategory(routine: Routine): { routine: Routine; key: string } {
	const categories = routine.categories ?? {};
	let key = 'category';
	for (let n = 2; Object.hasOwn(categories, key); n++) key = `category_${n}`;
	const taken = new Set(Object.values(categories).map((category) => category.color));
	const color = CATEGORY_COLORS.find((c) => !taken.has(c)) ?? 'gray';
	const next = cloneRoutine(routine);
	next.categories = { ...next.categories, [key]: { name: 'New category', color } };
	return { routine: next, key };
}

export function updateCategory(
	routine: Routine,
	key: string,
	change: { name?: string; color?: CategoryColor }
): Routine {
	if (!Object.hasOwn(routine.categories ?? {}, key)) throw new Error('Category does not exist.');
	if (change.name !== undefined && !change.name.trim()) throw new Error('Enter a category name.');
	const next = cloneRoutine(routine);
	const category = next.categories![key];
	if (change.name !== undefined) category.name = change.name.trim();
	if (change.color !== undefined) category.color = change.color;
	return next;
}

export function removeCategory(routine: Routine, key: string): Routine {
	const references = categoryReferences(routine, key);
	if (references.length)
		throw new Error(`This category is used by ${references.join(', ')}. Change their category first.`);
	const next = cloneRoutine(routine);
	if (next.categories) delete next.categories[key];
	if (next.categories && !Object.keys(next.categories).length) delete next.categories;
	return next;
}
