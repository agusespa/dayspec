import { Ajv2020 } from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { SCHEMA_PATH } from '../../../routine-plugin.ts';
import { validateRoutine } from './validate.ts';
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const EVERY_DAY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function withDay(day: object, extra: object = {}) {
	return { templates: { saturday: { on: EVERY_DAY, ...day } }, ...extra };
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
				'templates.saturday.items.0.time: must match pattern "^([01][0-9]|2[0-3]):[0-5][0-9]$"',
				'templates.saturday.items.0: must NOT have unevaluated properties "colour"'
			])
		);
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
		).toContain('templates.saturday.items.0: must NOT have unevaluated properties "kind"');
	});
	it('rejects malformed activity URLs', () => {
		for (const link of ['missing', 'https://', 'javascript:alert(1)'])
			expect(
				validateRoutine(withDay({ items: [{ time: '08:00', title: 'A', duration: 5, link }] }), schema).length
			).toBeGreaterThan(0);
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
});
it('allows an empty library or unassigned days without requiring a holiday override', () => {
	expect(validateRoutine({ templates: {} }, schema)).toEqual([]);
	expect(validateRoutine({ templates: { monday: { on: ['mon'], items: [] } } }, schema)).toEqual([]);
});
it('accepts anchored duration blocks and rejects invalid duration values', () => {
	const value = {
		blocks: {
			morning: {
				name: 'Morning',
				items: [{ title: 'Stretch', duration: 15 }]
			}
		},
		templates: { mon: { on: ['mon'], items: [{ use: 'morning', time: '08:00' }] } }
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
		expect(validateRoutine({ templates: {}, blocks }, schema).length).toBeGreaterThan(0);
	expect(
		validateRoutine(
			{
				templates: {},
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
it('rejects removed schema version fields', () => {
	expect(validateRoutine({ version: 1, templates: {} }, schema).length).toBeGreaterThan(0);
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
	const value = { templates: {}, blocks: { b: { name: 'Block', items: [{ title: 'Missing' }] } } };
	expect(validateRoutine(value, schema).join(' ')).toContain('duration');
	expect(
		validateRoutine(
			{
				templates: {},
				blocks: { b: { name: 'Block', items: [{ title: 'Fixed', duration: 5, time: '08:00' }] } }
			},
			schema
		).join(' ')
	).toContain('time');
});

describe('calendar preference', () => {
	it('accepts Google or an omitted preference and rejects unsupported providers', () => {
		expect(validateRoutine({ templates: {}, settings: { calendar: 'google' } }, schema)).toEqual([]);
		expect(validateRoutine({ templates: {}, settings: {} }, schema)).toEqual([]);
		expect(
			validateRoutine({ templates: {}, settings: { calendar: 'unsupported' } }, schema).length
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
						choice: 'outer',
						paths: {
							a: [
								{ title: 'Work', time: '07:00', duration: 10 },
								{ choice: 'inner', paths: { a: [{ use: 'shared', time: '08:00' }] } }
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
		items: [{ choice: 'evening', paths: { going_out: [] } }]
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
		for (const items of [[entry], [{ choice: 'plan', paths: { a: [entry] } }]]) {
			expect(
				validateRoutine(
					{
						templates: {
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
				{ templates: { day: { on: ['mon'], items: [{ ...entry, time: '08:00' }] } }, blocks },
				schema
			)
		).toEqual([]);
	}
});

it('accepts one optional HTTP link on activities and rejects URL lists in templates and shared blocks', () => {
	const item = { title: 'Read', duration: 10, link: 'https://example.com/read' };
	const routine = {
		templates: { day: { on: ['mon'], items: [{ ...item, time: '08:00' }] } },
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
				{ ...routine, templates: { day: { on: ['mon'], items: [{ ...item, time: '08:00', link }] } } },
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

it('compiles each schema once while validating fresh data on every call', () => {
	const freshSchema = structuredClone(schema);
	const compile = vi.spyOn(Ajv2020.prototype, 'compile');
	try {
		expect(validateRoutine({ templates: {} }, freshSchema)).toEqual([]);
		expect(validateRoutine({}, freshSchema).length).toBeGreaterThan(0);
		expect(
			validateRoutine({ templates: {}, settings: { calendar: 'outlook' } }, freshSchema).length
		).toBeGreaterThan(0);
		expect(validateRoutine({ templates: {} }, freshSchema)).toEqual([]);
		expect(compile).toHaveBeenCalledTimes(1);
	} finally {
		compile.mockRestore();
	}
});
