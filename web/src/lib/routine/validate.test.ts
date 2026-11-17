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
		expect(validateRoutine(withDay({ items: [{ title: 'Wake', duration: 5 }] }), schema)).toEqual([]);
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
			withDay({ items: [{ use: 'nope' }, { title: 'B', duration: 5, when: { place: 'office' } }] }),
			schema
		);
		expect(errors).toEqual([
			'days.saturday.items[0]: unknown block "nope"',
			'days.saturday.items[1].when: "place" is not a choice of this day'
		]);
	});
	it('rejects malformed activity URLs', () => {
		for (const link of ['missing', 'https://', 'javascript:alert(1)'])
			expect(
				validateRoutine(withDay({ items: [{ title: 'A', duration: 5, link }] }), schema).length
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
					gym: { type: 'toggle', default: true }
				},
				items: [
					{ title: 'A', when: { place: 'beach' }, duration: 5 },
					{ title: 'B', when: { gym: 'yes' }, duration: 5 }
				]
			}),
			schema
		);
		expect(errors).toEqual(
			expect.arrayContaining([
				'days.saturday.choices.place.default.tue: "home" is not available on tue',
				'days.saturday.choices.place.default: missing a value for wed',
				'days.saturday.items[0].when.place: "beach" is not an option',
				'days.saturday.items[1].when.gym: a toggle takes true or false'
			])
		);
	});
	it('rejects circular blocks', () => {
		expect(
			validateRoutine(
				withDay(
					{ items: [{ use: 'loop' }] },
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
						{ title: 'Tea', duration: 5 },
						{ title: 'Tea', duration: 10 }
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
					weekday: { on: ['mon'], items: [{ title: 'A', duration: 5 }] },
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
	expect(validateRoutine(withDay({ items: [{ use: 'b0' }] }, { blocks }), schema)).toContain(
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
						items: [{ title: 'Unused', when: { location: 'home' }, duration: 5 }]
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
		validateRoutine(withDay({ items: [{ title: 'Morning', note: 'Water\nWash face', duration: 5 }] }), schema)
	).toEqual([]);
});

it('requires durations and rejects fixed start times inside shared blocks', () => {
	expect(validateRoutine(withDay({ items: [{ title: 'Missing' }] }), schema).join(' ')).toContain('duration');
	const value = { days: {}, blocks: { b: { name: 'Block', items: [{ title: 'Missing' }] } } };
	expect(validateRoutine(value, schema).join(' ')).toContain('duration');
	expect(
		validateRoutine(
			{ days: {}, blocks: { b: { name: 'Block', items: [{ title: 'Fixed', duration: 5, time: '08:00' }] } } },
			schema
		).join(' ')
	).toContain('set the start time');
});
