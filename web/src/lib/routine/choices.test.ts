import { describe, it, expect } from 'vitest';
import {
	addChoice,
	removeChoice,
	changeChoiceType,
	removeOption,
	setChoiceDefault,
	setChoiceDefaultMode,
	choiceUsed
} from './choices.ts';
import type { Choice, Routine } from './types.ts';
const base: Routine = { days: { daily: { on: ['mon'], items: [] } } };
describe('choice editing', () => {
	it('creates stable unique keys without mutating saved data', () => {
		const one = addChoice(base, 'daily');
		const two = addChoice(one, 'daily');
		expect(Object.keys(two.days.daily.choices!)).toEqual(['choice', 'choice_2']);
		expect(base.days.daily.choices).toBeUndefined();
		expect(removeChoice(two, 'daily', 'choice').days.daily.choices).not.toHaveProperty('choice');
	});
	it('protects references in nested branches and dependent alternatives', () => {
		const routine = addChoice(base, 'daily');
		routine.blocks = {
			outer: { name: 'Outer', items: [{ use: 'inner' }] },
			inner: {
				name: 'Inner',
				items: [{ title: 'Commute', duration: 10 }]
			}
		};
		routine.days.daily.items = [
			{
				when: { choice: { not: ['option_2'] } },
				items: [{ when: { days: ['mon'] }, items: [{ use: 'outer', time: '08:00' }] }]
			}
		];
		expect(choiceUsed(routine, 'daily', 'choice', 'option_2')).toBe(true);
		expect(() => removeChoice(routine, 'daily', 'choice')).toThrow('conditions');
		expect(() => changeChoiceType(routine, 'daily', 'choice', 'toggle')).toThrow('conditions');
		routine.days.daily.items = [];
		routine.days.daily.choices!.dependent = {
			type: 'toggle',
			default: false,
			active_when: { choice: 'option' }
		};
		expect(() => removeChoice(routine, 'daily', 'choice')).toThrow('conditions');
	});
	it('changes unused choice types without retaining incompatible options or defaults', () => {
		const toggle = changeChoiceType(addChoice(base, 'daily'), 'daily', 'choice', 'toggle');
		expect(toggle.days.daily.choices!.choice).toMatchObject({ type: 'toggle', default: false });
		expect(toggle.days.daily.choices!.choice.options).toBeUndefined();
		const selection = changeChoiceType(toggle, 'daily', 'choice', 'select');
		expect(selection.days.daily.choices!.choice.default).toBe('option');
	});
	it('protects defaults and referenced options while allowing unused options to be removed', () => {
		const routine = addChoice(base, 'daily');
		const choice = routine.days.daily.choices!.choice;
		choice.options!.third = { label: 'Third' };
		expect(() => removeOption(routine, 'daily', 'choice', 'option')).toThrow('defaults');
		routine.days.daily.items = [{ when: { choice: ['third'] }, items: [{ title: 'Work', duration: 10 }] }];
		expect(() => removeOption(routine, 'daily', 'choice', 'third')).toThrow('conditions');
		routine.days.daily.items = [];
		const removed = removeOption(routine, 'daily', 'choice', 'third');
		expect(removed.days.daily.choices!.choice.options).not.toHaveProperty('third');
		expect(choice.options).toHaveProperty('third');
		expect(() => removeOption(removed, 'daily', 'choice', 'option_2')).toThrow('two options');
	});
	it('updates one weekday default without erasing other weekday values', () => {
		const choice = { type: 'toggle' as const, default: { mon: true, tue: false } };
		expect(setChoiceDefault(choice, false, 'mon').default).toEqual({ mon: false, tue: false });
		expect(choice.default.mon).toBe(true);
	});
});

describe('choice default modes', () => {
	it('starts each weekday with the existing selection and preserves independent changes', () => {
		const choice: Choice = { options: { office: {}, home: {} }, default: 'office' };
		const weekdays = setChoiceDefaultMode(choice, ['mon', 'wed', 'fri'], true);
		expect(weekdays.default).toEqual({ mon: 'office', wed: 'office', fri: 'office' });
		const edited = setChoiceDefault(setChoiceDefault(weekdays, 'home', 'wed'), 'home', 'fri');
		expect(edited.default).toEqual({ mon: 'office', wed: 'home', fri: 'home' });
		expect(choice.default).toBe('office');
		expect(setChoiceDefaultMode(edited, ['mon', 'wed', 'fri'], true).default).toEqual(edited.default);
		expect(setChoiceDefaultMode(edited, ['mon', 'wed', 'fri'], false).default).toBe('office');
	});
	it.each([false, true])('preserves a toggle default of %s in both modes', (value) => {
		const choice: Choice = { type: 'toggle', default: value };
		const weekdays = setChoiceDefaultMode(choice, ['wed', 'fri'], true);
		expect(weekdays.default).toEqual({ wed: value, fri: value });
		expect(setChoiceDefaultMode(weekdays, ['wed', 'fri'], false).default).toBe(value);
	});
	it('chooses available options for restricted days and only allows common defaults', () => {
		const choice: Choice = {
			options: { office: { only_on: ['mon'] }, home: { only_on: ['fri'] } },
			default: { mon: 'office', fri: 'home' }
		};
		expect(setChoiceDefaultMode(choice, ['mon', 'fri'], true).default).toEqual(choice.default);
		expect(() => setChoiceDefaultMode(choice, ['mon', 'fri'], false)).toThrow('every assigned day');
		const common: Choice = { ...choice, options: { ...choice.options, anywhere: {} } };
		expect(setChoiceDefaultMode(common, ['mon', 'fri'], false).default).toBe('anywhere');
		expect(setChoiceDefaultMode({ ...choice, default: 'office' }, ['mon', 'fri'], true).default).toEqual({
			mon: 'office',
			fri: 'home'
		});
	});
});
