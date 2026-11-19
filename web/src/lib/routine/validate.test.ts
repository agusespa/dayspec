import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_PATH } from '../../../routine-plugin.ts';
import type { Block } from './types.ts';
import { validateRoutine } from './validate.ts';
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const EVERY_DAY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function withDay(day: object, extra: object = {}) {
	return { days: { saturday: { on: EVERY_DAY, ...day } }, ...extra };
}
describe('validateRoutine', () => {
	it('accepts a minimal routine', () => {
		expect(
			validateRoutine(withDay({ items: [{ time: '08:00', title: 'Wake', duration: 5 }] }), schema)
		).toEqual([]);
	});
	it('reports schema errors with their location', () => {
		const errors = validateRoutine(
			withDay({ items: [{ title: 'Wake', time: '7:00', colour: 'red', duration: 5 }] }),
			schema
		);
		expect(errors).toEqual(
			expect.arrayContaining([
				'days.saturday.items.0.time: must match pattern "^([01][0-9]|2[0-3]):[0-5][0-9]$"',
				'days.saturday.items.0: must NOT have additional properties "colour"'
			])
		);
	});
	it('reports unknown blocks and choices', () => {
		const errors = validateRoutine(
			withDay({
				items: [
					{ time: '08:00', use: 'nope' },
					{ alternative: 'place', paths: { office: [{ time: '08:00', title: 'B', duration: 5 }] } }
				]
			}),
			schema
		);
		expect(errors).toEqual([
			'days.saturday.items[0]: unknown block "nope"',
			'days.saturday.items[1]: unknown alternative "place"'
		]);
	});
	it('requires item categories to exist, in templates and blocks', () => {
		const categories = { chores: { name: 'Chores', color: 'orange' } };
		expect(
			validateRoutine(
				withDay({ items: [{ time: '08:00', title: 'A', duration: 5, category: 'chores' }] }, { categories }),
				schema
			)
		).toEqual([]);
		expect(
			validateRoutine(
				withDay(
					{ items: [{ time: '08:00', title: 'A', duration: 5, category: 'gone' }] },
					{ categories, blocks: { b: { name: 'B', items: [{ title: 'C', duration: 5, category: 'gone' }] } } }
				),
				schema
			)
		).toEqual(['days.saturday.items[0]: unknown category "gone"', 'blocks.b[0]: unknown category "gone"']);
		expect(
			validateRoutine(
				withDay(
					{ items: [] },
					{ categories, blocks: { b: { name: 'B', category: 'gone', items: [{ title: 'C', duration: 5 }] } } }
				),
				schema
			)
		).toEqual(['blocks.b: unknown category "gone"']);
	});
	it('only takes palette colours and no longer accepts kind', () => {
		expect(
			validateRoutine(withDay({ items: [] }, { categories: { x: { name: 'X', color: '#ff0000' } } }), schema)
				.length
		).toBeGreaterThan(0);
		expect(
			validateRoutine(
				withDay({ items: [{ time: '08:00', title: 'A', duration: 5, kind: 'maintenance' }] }),
				schema
			)
		).toContain('days.saturday.items.0: must NOT have additional properties "kind"');
	});
	it('rejects malformed activity URLs', () => {
		for (const link of ['missing', 'https://', 'javascript:alert(1)'])
			expect(
				validateRoutine(withDay({ items: [{ time: '08:00', title: 'A', duration: 5, link }] }), schema).length
			).toBeGreaterThan(0);
	});
	it('reports invalid choice values and defaults', () => {
		const errors = validateRoutine(
			withDay({
				on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
				choices: {
					place: {
						options: { office: {}, home: { only_on: ['mon'] } },
						default: { mon: 'home', tue: 'home' }
					},
					gym: { options: { yes: { label: 'Yes' }, no: { label: 'No' } }, default: 'yes' }
				},
				items: [
					{ alternative: 'place', paths: { beach: [{ time: '08:00', title: 'A', duration: 5 }] } },
					{ alternative: 'gym', paths: { unknown: [{ time: '08:00', title: 'B', duration: 5 }] } }
				]
			}),
			schema
		);
		expect(errors).toEqual(
			expect.arrayContaining([
				'days.saturday.choices.place.default.tue: "home" is not available on tue',
				'days.saturday.choices.place.default: missing a value for wed',
				'days.saturday.items[0].paths: "beach" is not an option of "place"',
				'days.saturday.items[1].paths: "unknown" is not an option of "gym"'
			])
		);
	});
	it('rejects circular blocks', () => {
		expect(
			validateRoutine(
				withDay(
					{ items: [{ time: '08:00', use: 'loop' }] },
					{ blocks: { loop: { name: 'Loop', items: [{ use: 'loop' }] } } }
				),
				schema
			)
		).toContain('blocks.loop: uses itself (loop → loop)');
	});
	it('allows repeated titles in independent activities', () => {
		expect(
			validateRoutine(
				withDay({
					items: [
						{ time: '08:00', title: 'Tea', duration: 5 },
						{ time: '08:00', title: 'Tea', duration: 10 }
					]
				}),
				schema
			)
		).toEqual([]);
	});
	it('rejects end-time and occurrence content overrides', () => {
		for (const entry of [
			{ title: 'Tea', duration: 5, end: '08:00' },
			{ use: 'tea', note: 'Override' }
		])
			expect(
				validateRoutine(
					withDay(
						{ items: [entry] },
						{ blocks: { tea: { name: 'Tea', items: [{ title: 'Tea', duration: 5 }] } } }
					),
					schema
				).length
			).toBeGreaterThan(0);
	});
	it('rejects overlapping assignments and dangling explicit holiday templates', () => {
		const errors = validateRoutine(
			{
				settings: { holiday: 'nope' },
				days: {
					weekday: { on: ['mon'], items: [{ time: '08:00', title: 'A', duration: 5 }] },
					other: { on: ['mon'], items: [] }
				}
			},
			schema
		);
		expect(errors).toEqual(
			expect.arrayContaining([
				'days: mon is in more than one template (weekday, other)',
				'settings.holiday: there is no day template "nope"'
			])
		);
	});
});
it('bounds repeated shared-block expansion before it can freeze the editor', () => {
	const blocks: Record<string, Block> = { b16: { name: 'Leaf', items: [{ title: 'Leaf', duration: 5 }] } };
	for (let n = 15; n >= 0; n--)
		blocks[`b${n}`] = { name: `Block ${n}`, items: [{ use: `b${n + 1}` }, { use: `b${n + 1}` }] };
	expect(validateRoutine(withDay({ items: [{ time: '08:00', use: 'b0' }] }, { blocks }), schema)).toContain(
		'routine: expanded routine exceeds 10000 entries'
	);
});
it('allows an empty library or unassigned days without requiring a holiday override', () => {
	expect(validateRoutine({ days: {} }, schema)).toEqual([]);
	expect(validateRoutine({ days: { monday: { on: ['mon'], items: [] } } }, schema)).toEqual([]);
});
it('preserves dormant weekday choice settings when days are unassigned', () => {
	expect(
		validateRoutine(
			{
				days: {
					monday: {
						on: ['mon'],
						choices: {
							place: {
								options: { home: {}, office: { only_on: ['tue'] } },
								default: { mon: 'home', tue: 'office' }
							}
						},
						items: []
					}
				}
			},
			schema
		)
	).toEqual([]);
});
it('accepts anchored duration blocks and rejects invalid duration values', () => {
	const value = {
		blocks: {
			morning: {
				name: 'Morning',
				items: [{ title: 'Stretch', duration: 15 }]
			}
		},
		days: { mon: { on: ['mon'], items: [{ use: 'morning', time: '08:00' }] } }
	};
	expect(validateRoutine(value, schema)).toEqual([]);
	for (const duration of [0, -1, 1.5, 1441, '15']) {
		value.blocks.morning.items[0].duration = duration as number;
		expect(validateRoutine(value, schema).length).toBeGreaterThan(0);
	}
});
it('accepts only boolean automatic holiday preferences', () => {
	for (const value of [true, false])
		expect(
			validateRoutine(withDay({ items: [] }, { settings: { automatic_swedish_holidays: value } }), schema)
		).toEqual([]);
	for (const value of ['false', 0, null])
		expect(
			validateRoutine(withDay({ items: [] }, { settings: { automatic_swedish_holidays: value } }), schema)
				.length
		).toBeGreaterThan(0);
});
it('validates unused blocks without requiring template-specific choices', () => {
	for (const blocks of [
		{ unused: [{ use: 'missing' }] },
		{ unused: [{ use: 'unused' }] },
		{ unused: { title: 'Unused', link: 'missing', duration: 5 } },
		{ unused: { title: 'Parent', children: [{ title: 'Child', time: '08:00', duration: 5 }], duration: 5 } }
	])
		expect(validateRoutine({ days: {}, blocks }, schema).length).toBeGreaterThan(0);
	expect(
		validateRoutine(
			{
				days: {},
				blocks: {
					unused: {
						name: 'Unused',
						items: [{ title: 'Unused', duration: 5 }]
					}
				}
			},
			schema
		)
	).toEqual([]);
});
it('rejects a scalar default unavailable on an assigned weekday', () => {
	expect(
		validateRoutine(
			withDay({
				on: ['mon', 'tue'],
				items: [],
				choices: {
					place: { options: { home: { only_on: ['mon'] }, office: {} }, default: 'home' }
				}
			}),
			schema
		)
	).toContain('days.saturday.choices.place.default: "home" is not available on tue');
});
it('rejects removed schema version fields', () => {
	expect(validateRoutine({ version: 1, days: {} }, schema).length).toBeGreaterThan(0);
});
it('rejects checklist fields on activities and shared-block references', () => {
	for (const item of [
		{ title: 'Morning', children: [{ title: 'Water', duration: 5 }], duration: 5 },
		{ use: 'morning', children: [{ title: 'Water', duration: 5 }] }
	]) {
		expect(
			validateRoutine(
				withDay(
					{ items: [item] },
					{
						blocks: {
							morning: {
								name: 'Morning',
								items: [{ title: 'Wash', duration: 5 }]
							}
						}
					}
				),
				schema
			).join(' ')
		).toContain('children');
	}
	expect(
		validateRoutine(
			withDay({ items: [{ time: '08:00', title: 'Morning', note: 'Water\nWash face', duration: 5 }] }),
			schema
		)
	).toEqual([]);
});

it('requires durations and rejects fixed start times inside shared blocks', () => {
	expect(
		validateRoutine(withDay({ items: [{ time: '08:00', title: 'Missing' }] }), schema).join(' ')
	).toContain('duration');
	const value = { days: {}, blocks: { b: { name: 'Block', items: [{ title: 'Missing' }] } } };
	expect(validateRoutine(value, schema).join(' ')).toContain('duration');
	expect(
		validateRoutine(
			{ days: {}, blocks: { b: { name: 'Block', items: [{ title: 'Fixed', duration: 5, time: '08:00' }] } } },
			schema
		).join(' ')
	).toContain('time');
});

describe('calendar preference', () => {
	it('accepts Google or an omitted preference and rejects unsupported providers', () => {
		expect(validateRoutine({ days: {}, settings: { calendar: 'google' } }, schema)).toEqual([]);
		expect(validateRoutine({ days: {}, settings: {} }, schema)).toEqual([]);
		expect(
			validateRoutine({ days: {}, settings: { calendar: 'unsupported' } }, schema).length
		).toBeGreaterThan(0);
	});
});

describe('branch-only conditions and reusable block contents', () => {
	it.each([
		{ title: 'Work', duration: 10, when: { days: ['mon'] } },
		{ use: 'shared', when: { days: ['mon'] } },
		{ items: [] },
		{ when: {}, items: [] }
	])('rejects a non-branch condition or an invalid branch: %j', (entry) => {
		expect(validateRoutine(withDay({ items: [entry] }), schema).length).toBeGreaterThan(0);
	});
	it.each([
		{ title: 'Work', duration: 10, when: { days: ['mon'] } },
		{ when: { days: ['mon'] }, items: [{ title: 'Work', duration: 10 }] },
		{ title: 'Work', duration: 10, time: '08:00' },
		{ title: 'Work', duration: 10, approx: true },
		{ use: 'inner', time: '08:00' },
		{ use: 'inner', when: { days: ['mon'] } }
	])('rejects template-only fields inside shared blocks: %j', (entry) => {
		const blocks = {
			shared: { name: 'Shared', items: [entry] },
			inner: { name: 'Inner', items: [{ title: 'Tea', duration: 5 }] }
		};
		for (const items of [[], [{ use: 'shared', time: '08:00' }]])
			expect(validateRoutine(withDay({ items }, { blocks }), schema).length).toBeGreaterThan(0);
	});
	it('accepts explicit nested forks around activities and shared block occurrences', () => {
		const choice = { options: { a: {}, b: {} }, default: 'a' };
		const routine = withDay(
			{
				choices: { outer: choice, inner: choice },
				items: [
					{
						alternative: 'outer',
						paths: {
							a: [
								{ title: 'Work', time: '07:00', duration: 10 },
								{ alternative: 'inner', paths: { a: [{ use: 'shared', time: '08:00' }] } }
							]
						}
					}
				]
			},
			{
				blocks: {
					shared: { name: 'Shared', items: [{ title: 'Tea', duration: 5 }, { use: 'inner' }] },
					inner: { name: 'Inner', items: [{ title: 'Read', duration: 10 }] }
				}
			}
		);
		expect(validateRoutine(routine, schema)).toEqual([]);
	});
});

it('requires named options and rejects toggle definitions and boolean conditions/defaults', () => {
	const choice = {
		options: { stay_home: { label: 'Stay home' }, going_out: { label: 'Going out' } },
		default: 'stay_home'
	};
	const routine = withDay({
		choices: { evening: choice },
		items: [{ alternative: 'evening', paths: { going_out: [] } }]
	});
	expect(validateRoutine(routine, schema)).toEqual([]);
	for (const bad of [
		{ ...choice, type: 'toggle' },
		{ ...choice, type: 'select' },
		{ default: 'stay_home' },
		{ ...choice, options: { stay_home: {} } },
		{ ...choice, default: false },
		{ ...choice, default: { sat: true } }
	]) {
		expect(validateRoutine(withDay({ choices: { evening: bad }, items: [] }), schema).length).toBeGreaterThan(
			0
		);
	}
	expect(
		validateRoutine(
			withDay({ choices: { evening: choice }, items: [{ when: { evening: true }, items: [] }] }),
			schema
		).length
	).toBeGreaterThan(0);
});

it('requires valid start times for template activities and block occurrences, including branches', () => {
	const blocks = { morning: { name: 'Morning', items: [{ title: 'Wash', duration: 5 }] } };
	for (const entry of [{ title: 'Walk', duration: 10 }, { use: 'morning' }]) {
		for (const items of [[entry], [{ alternative: 'plan', paths: { a: [entry] } }]]) {
			expect(
				validateRoutine(
					{
						days: {
							day: { on: ['mon'], choices: { plan: { options: { a: {}, b: {} }, default: 'a' } }, items }
						},
						blocks
					},
					schema
				).length
			).toBeGreaterThan(0);
		}
		expect(
			validateRoutine(
				{ days: { day: { on: ['mon'], items: [{ ...entry, time: '08:00' }] } }, blocks },
				schema
			)
		).toEqual([]);
	}
});

it('accepts one optional HTTP link on activities and rejects URL lists in templates and shared blocks', () => {
	const item = { title: 'Read', duration: 10, link: 'https://example.com/read' };
	const routine = {
		days: { day: { on: ['mon'], items: [{ ...item, time: '08:00' }] } },
		blocks: { reading: { name: 'Reading', items: [item] } }
	};
	expect(validateRoutine(routine, schema)).toEqual([]);
	for (const link of [
		[],
		['https://example.com/read'],
		['https://example.com/read', 'https://example.com/other'],
		'javascript:alert(1)',
		'https://'
	]) {
		expect(
			validateRoutine(
				{ ...routine, days: { day: { on: ['mon'], items: [{ ...item, time: '08:00', link }] } } },
				schema
			).length
		).toBeGreaterThan(0);
		expect(
			validateRoutine(
				{ ...routine, blocks: { reading: { name: 'Reading', items: [{ ...item, link }] } } },
				schema
			).length
		).toBeGreaterThan(0);
	}
});
