import { describe, expect, it } from 'vitest';
import {
	cloneRoutine,
	moveEntry,
	newEntry,
	createTemplate,
	assignTemplateDays,
	templateName,
	templateKeys,
	availableDays,
	removeTemplate,
	createBlock,
	removeBlock,
	blockReferences,
	renameBlock
} from './edit.ts';
import type { Entry, Routine } from './types.ts';
const routine: Routine = {
	blocks: {
		shared: {
			name: 'Shared',
			items: [{ title: 'New item', duration: 5 }]
		}
	},
	days: {
		saturday: {
			on: ['sat'],
			items: [
				{
					items: [
						{ title: 'New item 2', duration: 5 },
						{ title: 'New item 3', duration: 5 }
					]
				}
			]
		}
	}
};
describe('template drafts', () => {
	it('detaches nested entries, shared blocks and weekday assignments from the active routine', () => {
		const draft = cloneRoutine(routine);
		draft.days.saturday.items.push({ title: 'Draft only', duration: 5 });
		draft.days.saturday.on.push('sun');
		draft.blocks!.shared.items[0] = { title: 'Changed', duration: 5 };
		expect(routine.days.saturday.items).toHaveLength(1);
		expect(routine.days.saturday.on).toEqual(['sat']);
		expect(routine.blocks!.shared.items).toEqual([{ title: 'New item', duration: 5 }]);
	});
	it('moves entries without changing the original list or conditional content', () => {
		const entries: Entry[] = [
			{ use: 'shared', when: { gym: true } },
			{ title: 'Read', duration: 5 }
		];
		expect(moveEntry(entries, 1, -1)).toEqual([entries[1], entries[0]]);
		expect(moveEntry(entries, 0, 1)).toEqual([entries[1], entries[0]]);
		expect(moveEntry(entries, 0, -1)).toBe(entries);
		expect(moveEntry(entries, 1, 1)).toBe(entries);
		expect(entries[0]).toHaveProperty('use', 'shared');
	});
	it('allows independent entries with identical titles', () => {
		expect(newEntry(routine)).toEqual({ title: 'New item', duration: 5 });
	});
});
describe('template creation and naming', () => {
	const daily: Routine = {
		settings: { holiday: 'daily' },
		days: {
			daily: {
				on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
				items: [{ title: 'Keep me', duration: 5 }]
			}
		}
	};
	it('names day sets in calendar order', () => {
		expect(templateName(daily.days.daily.on)).toBe('Daily');
		expect(templateName(['fri', 'mon', 'tue', 'wed', 'thu'])).toBe('Weekdays');
		expect(templateName(['sun', 'sat'])).toBe('Weekend');
		expect(templateName(['wed'])).toBe('Wednesday');
		expect(templateName(['fri', 'mon', 'wed'])).toBe('Mon, Wed, Fri');
		expect(templateName([])).toBe('New template');
	});
	it('creates templates only on available days without changing existing routines', () => {
		const partial = assignTemplateDays(daily, 'daily', ['mon', 'tue', 'wed', 'thu', 'fri']);
		expect(availableDays(partial)).toEqual(['sat', 'sun']);
		const created = createTemplate(partial, ['sun', 'sat']);
		expect(created.routine.days[created.key]).toEqual({ on: ['sat', 'sun'], items: [] });
		expect(created.routine.days.daily.items).toEqual([{ title: 'Keep me', duration: 5 }]);
		expect(created.routine.settings?.holiday).toBe('daily');
		expect(availableDays(created.routine)).toEqual([]);
		expect(daily.days.daily.on).toHaveLength(7);
		expect(() => createTemplate(daily, ['sat'])).toThrow('already belong');
		expect(() => createTemplate(daily, [])).toThrow('Select at least one day');
		expect(() => assignTemplateDays(daily, 'daily', [])).toThrow('Select at least one day');
		expect(() => assignTemplateDays(daily, 'absent', ['mon'])).toThrow('does not exist');
	});
	it('deletes a template without dangling holiday references or changing the original', () => {
		const empty = removeTemplate(daily, 'daily');
		expect(empty.days).toEqual({});
		expect(empty.settings?.holiday).toBeUndefined();
		expect(daily.settings?.holiday).toBe('daily');
		expect(daily.days.daily.items).toHaveLength(1);
		expect(availableDays(empty)).toHaveLength(7);
		const created = createTemplate(empty, ['mon']);
		expect(availableDays(created.routine)).toHaveLength(6);
	});
});
describe('shared block management', () => {
	it('creates stable IDs independently of display names', () => {
		const created = createBlock(routine, '  Morning routine  ');
		expect(created.key).toBe('block');
		expect(created.routine.blocks?.block).toEqual({
			name: 'Morning routine',
			items: [{ title: 'New item', duration: 5 }]
		});
		expect(routine.blocks).not.toHaveProperty('block');
		const other = createBlock(created.routine, 'Morning routine');
		expect(other.key).toBe('block_2');
		expect(() => createBlock(routine, ' ')).toThrow('Enter a block name');
	});
	it('finds nested references in templates and other blocks before deletion', () => {
		const used: Routine = {
			days: {
				mon: {
					on: ['mon'],
					items: [{ when: { use: 'shared' }, items: [{ items: [{ use: 'shared' }] }] }]
				}
			},
			blocks: {
				shared: {
					name: 'Shared',
					items: [{ title: 'Tea', duration: 5 }]
				},
				morning: {
					name: 'Morning',
					items: [{ use: 'shared' }]
				}
			}
		};
		expect(blockReferences(used, 'shared')).toEqual(['Monday', 'Morning']);
		expect(() => removeBlock(used, 'shared')).toThrow('Remove those references first');
		expect(removeBlock(used, 'morning').blocks).not.toHaveProperty('morning');
		expect(used.blocks).toHaveProperty('morning');
	});
	it('ignores choice conditions named use and deletes only an unused block', () => {
		const unused: Routine = {
			days: { mon: { on: ['mon'], items: [{ title: 'One', when: { use: 'shared' }, duration: 5 }] } },
			blocks: {
				shared: {
					name: 'Shared',
					items: [{ title: 'Tea', duration: 5 }]
				},
				other: {
					name: 'Other',
					items: [{ title: 'Other', duration: 5 }]
				}
			}
		};
		expect(blockReferences(unused, 'shared')).toEqual([]);
		expect(removeBlock(unused, 'shared').blocks).toEqual({
			other: { name: 'Other', items: [{ title: 'Other', duration: 5 }] }
		});
	});
});
describe('naming shared blocks', () => {
	const source: Routine = {
		blocks: {
			stable: { name: 'Before', items: [{ title: 'Stretch', duration: 15 }] },
			other: { name: 'Other', items: [{ use: 'stable' }] }
		},
		days: { mon: { on: ['mon'], items: [{ items: [{ use: 'stable' }] }] } }
	};
	it('preserves IDs, content, references, punctuation and capitalization', () => {
		const renamed = renameBlock(source, 'stable', 'Morning — Wake Up!');
		expect(Object.keys(renamed.blocks!)).toEqual(['stable', 'other']);
		expect(renamed.blocks!.stable).toEqual({ ...source.blocks!.stable, name: 'Morning — Wake Up!' });
		expect(renamed.blocks!.other).toEqual(source.blocks!.other);
		expect(renamed.days).toEqual(source.days);
		expect(source.blocks!.stable.name).toBe('Before');
	});
	it('rejects an empty name or missing block without changing data', () => {
		expect(() => renameBlock(source, 'stable', ' ')).toThrow('Enter a block name');
		expect(() => renameBlock(source, 'missing', 'New')).toThrow('does not exist');
	});
});

describe('template library order', () => {
	it('orders by the earliest assigned weekday regardless of saved key or assignment order', () => {
		const library: Routine = {
			days: {
				friday: { on: ['fri'], items: [] },
				weekend: { on: ['sun', 'sat'], items: [] },
				workdays: { on: ['thu', 'mon', 'wed', 'tue'], items: [] }
			}
		};
		const before = JSON.stringify(library);
		expect(templateKeys(library)).toEqual(['workdays', 'friday', 'weekend']);
		expect(JSON.stringify(library)).toBe(before);
	});
	it('handles an empty library', () => {
		expect(templateKeys({ days: {} })).toEqual([]);
	});
});
