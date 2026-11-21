import { describe, expect, it } from 'vitest';
import {
	blocksByName,
	cloneRoutine,
	moveEntry,
	sortEntriesByTime,
	sortRoutineByTime,
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
	renameBlock,
	categoryReferences,
	createCategory,
	updateCategory,
	removeCategory
} from './edit.ts';
import type { Choice, Entry, SharedEntry, Routine } from './types.ts';
const routine: Routine = {
	blocks: {
		shared: {
			name: 'Shared',
			items: [{ title: 'New item', duration: 5 }]
		}
	},
	templates: {
		saturday: {
			on: ['sat'],
			items: [
				{
					choice: 'schedule',
					paths: {
						regular: [
							{ time: '08:00', title: 'New item 2', duration: 5 },
							{ time: '08:00', title: 'New item 3', duration: 5 }
						]
					}
				}
			]
		}
	}
};
describe('template drafts', () => {
	it('detaches nested entries, shared blocks and weekday assignments from the active routine', () => {
		const draft = cloneRoutine(routine);
		draft.templates.saturday.items.push({ time: '08:00', title: 'Draft only', duration: 5 });
		draft.templates.saturday.on.push('sun');
		draft.blocks!.shared.items[0] = { title: 'Changed', duration: 5 };
		expect(routine.templates.saturday.items).toHaveLength(1);
		expect(routine.templates.saturday.on).toEqual(['sat']);
		expect(routine.blocks!.shared.items).toEqual([{ title: 'New item', duration: 5 }]);
	});
	it('moves shared-block entries without changing their content or the original sequence', () => {
		const entries: SharedEntry[] = [{ use: 'shared' }, { title: 'Read', duration: 5 }];
		expect(moveEntry(entries, 1, -1)).toEqual([entries[1], entries[0]]);
		expect(moveEntry(entries, 0, 1)).toEqual([entries[1], entries[0]]);
		expect(moveEntry(entries, 0, -1)).toBe(entries);
		expect(moveEntry(entries, 1, 1)).toBe(entries);
		expect(entries[0]).toHaveProperty('use', 'shared');
	});
	it('allows independent entries with identical titles', () => {
		expect(newEntry(routine)).toEqual({ title: 'New activity', duration: 5 });
	});
});
describe('template creation and naming', () => {
	const daily: Routine = {
		settings: { holiday_template: 'daily' },
		templates: {
			daily: {
				on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
				items: [{ time: '08:00', title: 'Keep me', duration: 5 }]
			}
		}
	};
	it('names day sets in calendar order', () => {
		expect(templateName(daily.templates.daily.on)).toBe('Daily');
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
		expect(created.routine.templates[created.key]).toEqual({ on: ['sat', 'sun'], items: [] });
		expect(created.routine.templates.daily.items).toEqual([{ title: 'Keep me', duration: 5, time: '08:00' }]);
		expect(created.routine.settings?.holiday_template).toBe('daily');
		expect(availableDays(created.routine)).toEqual([]);
		expect(daily.templates.daily.on).toHaveLength(7);
		expect(() => createTemplate(daily, ['sat'])).toThrow('already belong');
		expect(() => createTemplate(daily, [])).toThrow('Select at least one day');
		expect(() => assignTemplateDays(daily, 'daily', [])).toThrow('Select at least one day');
		expect(() => assignTemplateDays(daily, 'absent', ['mon'])).toThrow('does not exist');
	});
	it('deletes a template without dangling holiday references or changing the original', () => {
		const empty = removeTemplate(daily, 'daily');
		expect(empty.templates).toEqual({});
		expect(empty.settings?.holiday_template).toBeUndefined();
		expect(daily.settings?.holiday_template).toBe('daily');
		expect(daily.templates.daily.items).toHaveLength(1);
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
			items: [{ title: 'New activity', duration: 5 }]
		});
		expect(routine.blocks).not.toHaveProperty('block');
		const other = createBlock(created.routine, 'Morning routine');
		expect(other.key).toBe('block_2');
		expect(() => createBlock(routine, ' ')).toThrow('Enter a routine name');
	});
	it('finds nested references in templates and other blocks before deletion', () => {
		const used: Routine = {
			templates: {
				mon: {
					on: ['mon'],
					items: [
						{
							choice: 'use',
							paths: {
								shared: [{ choice: 'schedule', paths: { regular: [{ time: '08:00', use: 'shared' }] } }]
							}
						}
					]
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
	it('ignores choices named use and deletes only an unused block', () => {
		const unused: Routine = {
			templates: {
				mon: {
					on: ['mon'],
					items: [{ choice: 'use', paths: { shared: [{ time: '08:00', title: 'One', duration: 5 }] } }]
				}
			},
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
		templates: {
			mon: {
				on: ['mon'],
				items: [{ choice: 'schedule', paths: { regular: [{ time: '08:00', use: 'stable' }] } }]
			}
		}
	};
	it('preserves IDs, content, references, punctuation and capitalization', () => {
		const renamed = renameBlock(source, 'stable', 'Morning — Wake Up!');
		expect(Object.keys(renamed.blocks!)).toEqual(['stable', 'other']);
		expect(renamed.blocks!.stable).toEqual({ ...source.blocks!.stable, name: 'Morning — Wake Up!' });
		expect(renamed.blocks!.other).toEqual(source.blocks!.other);
		expect(renamed.templates).toEqual(source.templates);
		expect(source.blocks!.stable.name).toBe('Before');
	});
	it('rejects an empty name or missing block without changing data', () => {
		expect(() => renameBlock(source, 'stable', ' ')).toThrow('Enter a routine name');
		expect(() => renameBlock(source, 'missing', 'New')).toThrow('does not exist');
	});
});

describe('template library order', () => {
	it('orders by the earliest assigned weekday regardless of saved key or assignment order', () => {
		const library: Routine = {
			templates: {
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
		expect(templateKeys({ templates: {} })).toEqual([]);
	});
});

describe('categories', () => {
	const withCategories: Routine = {
		categories: {
			chores: { name: 'Chores', color: 'orange' },
			rest: { name: 'Rest', color: 'indigo' }
		},
		blocks: { evening: { name: 'Evening', items: [{ title: 'Dishes', duration: 10, category: 'chores' }] } },
		templates: {
			daily: {
				on: ['mon'],
				items: [
					{ time: '08:00', title: 'Laundry', duration: 30, category: 'chores' },
					{
						choice: 'schedule',
						paths: { regular: [{ time: '08:00', title: 'Laundry', duration: 30, category: 'chores' }] }
					},
					{ time: '08:00', title: 'Nap', duration: 20, category: 'rest' }
				]
			}
		}
	};

	it('lists each item title that uses a category once, across templates, groups and blocks', () => {
		expect(categoryReferences(withCategories, 'chores')).toEqual(['Laundry', 'Dishes']);
		expect(categoryReferences(withCategories, 'absent')).toEqual([]);
		const blockInRest = {
			...withCategories,
			blocks: { evening: { ...withCategories.blocks!.evening, category: 'rest' } }
		};
		expect(categoryReferences(blockInRest, 'rest')).toEqual(['Nap', 'Evening']);
		expect(() => removeCategory(blockInRest, 'rest')).toThrow('Nap, Evening');
	});

	it('creates a category with a fresh key and the first unused colour', () => {
		const { routine: next, key } = createCategory(withCategories);
		expect(key).toBe('category');
		expect(next.categories?.category).toEqual({ name: 'New category', color: 'yellow' });
		expect(createCategory(next).key).toBe('category_2');
		expect(createCategory({ templates: {} }).routine.categories).toEqual({
			category: { name: 'New category', color: 'orange' }
		});
		expect(withCategories.categories?.category).toBeUndefined();
	});

	it('renames and recolours without touching the key', () => {
		const next = updateCategory(withCategories, 'rest', { name: '  Rest & Sleep ', color: 'blue' });
		expect(next.categories?.rest).toEqual({ name: 'Rest & Sleep', color: 'blue' });
		expect(withCategories.categories?.rest.name).toBe('Rest');
		expect(() => updateCategory(withCategories, 'rest', { name: ' ' })).toThrow('Enter a category name.');
		expect(() => updateCategory(withCategories, 'absent', { color: 'red' })).toThrow();
	});

	it('only removes a category nothing uses', () => {
		expect(() => removeCategory(withCategories, 'chores')).toThrow('Laundry, Dishes');
		const unused = removeCategory(
			{
				...withCategories,
				categories: { ...withCategories.categories, spare: { name: 'Spare', color: 'gray' } }
			},
			'spare'
		);
		expect(Object.keys(unused.categories ?? {})).toEqual(['chores', 'rest']);
		expect(
			removeCategory({ categories: { only: { name: 'Only', color: 'red' } }, templates: {} }, 'only')
				.categories
		).toBeUndefined();
	});
});

describe('fork ordering', () => {
	it('orders activities and whole forks by the earliest path time with stable ties and logical midnight', () => {
		const entries: Entry[] = [
			{ title: 'Midnight', time: '01:00', duration: 5 },
			{ title: 'Dinner', time: '19:00', duration: 30 },
			{
				choice: 'location',
				paths: {
					home: [{ title: 'Home', time: '09:00', duration: 5 }],
					office: [{ use: 'shared', time: '08:00' }]
				}
			},
			{ title: 'Breakfast', time: '07:00', duration: 15 },
			{ title: 'Same start', time: '08:00', duration: 10 }
		];
		const before = structuredClone(entries);
		expect(sortEntriesByTime(entries)).toEqual([entries[3], entries[2], entries[4], entries[1], entries[0]]);
		expect(sortEntriesByTime(entries, '00:00')[0]).toBe(entries[0]);
		expect(entries).toEqual(before);
	});
	it('orders nested path activities without moving their containing fork or shared block definitions', () => {
		const source: Routine = {
			blocks: {
				shared: {
					name: 'Shared',
					items: [
						{ title: 'First', duration: 5 },
						{ title: 'Second', duration: 10 }
					]
				}
			},
			templates: {
				day: {
					on: ['mon'],
					choices: {
						location: { options: { home: {}, office: {} }, default: 'home' },
						gym: { options: { train: {}, rest: {} }, default: 'train' }
					},
					items: [
						{ title: 'Dinner', time: '19:00', duration: 30 },
						{
							choice: 'location',
							paths: {
								home: [
									{ title: 'Late', time: '10:00', duration: 5 },
									{
										choice: 'gym',
										paths: {
											train: [
												{ use: 'shared', time: '09:00' },
												{ use: 'shared', time: '08:00' }
											],
											rest: []
										}
									}
								],
								office: []
							}
						},
						{ title: 'Breakfast', time: '07:00', duration: 15 }
					]
				}
			}
		};
		const before = structuredClone(source),
			sorted = sortRoutineByTime(source);
		expect(sorted.templates.day.items[0]).toHaveProperty('title', 'Breakfast');
		const fork = sorted.templates.day.items[1];
		if (!('paths' in fork)) throw Error();
		const child = fork.paths.home[0];
		if (!('paths' in child)) throw Error();
		expect(child.paths.train).toEqual([
			{ use: 'shared', time: '08:00' },
			{ use: 'shared', time: '09:00' }
		]);
		expect(sorted.blocks).toBe(source.blocks);
		expect(source).toEqual(before);
		expect(sortRoutineByTime(sorted)).toEqual(sorted);
		expect(sortRoutineByTime({ templates: {} })).toEqual({ templates: {} });
	});
	it('leaves empty forks and incomplete drafts in place while sorting valid times', () => {
		const entries: Entry[] = [
			{ title: 'Late', time: '20:00', duration: 5 },
			{ choice: 'place', paths: {} },
			{ title: 'Incomplete', time: '08:', duration: 5 },
			{ title: 'Early', time: '07:00', duration: 5 }
		];
		expect(sortEntriesByTime(entries)).toEqual([entries[3], entries[1], entries[2], entries[0]]);
	});
});

it('lists shared blocks by name, whatever order their keys were saved in', () => {
	const routine: Routine = {
		templates: {},
		blocks: {
			b: { name: 'yoga', items: [{ title: 'Flow', duration: 20 }] },
			a: { name: 'Breakfast', items: [{ title: 'Eat', duration: 15 }] },
			c: { name: 'Yoga', items: [{ title: 'Flow', duration: 20 }] }
		}
	};
	expect(blocksByName(routine).map(([key]) => key)).toEqual(['a', 'b', 'c']);
	expect(blocksByName({ templates: {} })).toEqual([]);
});
