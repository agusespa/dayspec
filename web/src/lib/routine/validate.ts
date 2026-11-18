/**
 * Validation of the bundled routine and template edits: the JSON Schema first, then the cross-references the
 * schema can't express. Used by the Vite plugin (vite.config.ts) the editor and the tests.
 */
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import {
	WEEKDAYS,
	isGroup,
	isUse,
	type Choice,
	type Entry,
	type ItemDef,
	type Routine,
	type When
} from './types.ts';

export function validateRoutine(data: unknown, schema: object): string[] {
	const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
	const validate = ajv.compile(schema);
	if (!validate(data)) return formatSchemaErrors(validate.errors ?? []);
	return checkReferences(data as Routine);
}

function formatSchemaErrors(errors: ErrorObject[]): string[] {
	// oneOf branches each report why they failed; the branch errors are what explain the problem.
	const messages = errors
		.filter((e) => e.keyword !== 'oneOf' && e.keyword !== 'if')
		.map((e) => {
			const where = e.instancePath.replace(/^\//, '').replace(/\//g, '.') || '(root)';
			const extra =
				e.keyword === 'additionalProperties'
					? ` "${(e.params as { additionalProperty: string }).additionalProperty}"`
					: e.keyword === 'enum'
						? `: ${(e.params as { allowedValues: unknown[] }).allowedValues.join(', ')}`
						: '';
			return `${where}: ${e.message}${extra}`;
		});
	return [...new Set(messages)];
}

export function checkReferences(routine: Routine): string[] {
	const errors = new Set<string>();
	const blocks = routine.blocks ?? {};

	for (const weekday of WEEKDAYS) {
		const owners = Object.keys(routine.days).filter((k) => routine.days[k].on.includes(weekday));
		if (owners.length > 1) errors.add(`days: ${weekday} is in more than one template (${owners.join(', ')})`);
	}
	const holiday = routine.settings?.holiday ?? '';
	if (routine.settings?.holiday && !routine.days[holiday])
		errors.add(`settings.holiday: there is no day template "${holiday}"`);

	const categories = routine.categories ?? {};
	const checkItem = (item: ItemDef, where: string) => {
		if (item.category !== undefined && !Object.hasOwn(categories, item.category))
			errors.add(`${where}: unknown category "${item.category}"`);
		for (const ref of item.link === undefined ? [] : Array.isArray(item.link) ? item.link : [item.link]) {
			try {
				const url = new URL(ref);
				if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
			} catch {
				errors.add(`${where}: invalid link URL`);
			}
		}
	};

	const checkWhen = (when: When | undefined, choices: Record<string, Choice>, where: string) => {
		for (const [key, cond] of Object.entries(when ?? {})) {
			if (key === 'days' || cond === undefined) continue;
			const choice = choices[key];
			if (!choice) {
				errors.add(`${where}: "${key}" is not a choice of this day`);
				continue;
			}
			if (choice.type === 'toggle') {
				if (typeof cond !== 'boolean') errors.add(`${where}.${key}: a toggle takes true or false`);
				continue;
			}
			if (typeof cond === 'boolean') {
				errors.add(`${where}.${key}: "${key}" is not a toggle`);
				continue;
			}
			const values = typeof cond === 'string' ? [cond] : Array.isArray(cond) ? cond : [cond.not].flat();
			for (const value of values) {
				if (!choice.options?.[value]) errors.add(`${where}.${key}: "${value}" is not an option`);
			}
		}
	};

	let remaining = 10_000;
	const walk = (
		entries: Entry[],
		choices: Record<string, Choice> | undefined,
		where: string,
		stack: string[],
		depth = 0
	) => {
		if (depth > 64 && entries.length) {
			errors.add(`${where}: nesting or block expansion exceeds 64 levels`);
			return;
		}
		entries.forEach((entry, i) => {
			if (remaining-- <= 0) {
				errors.add('routine: expanded routine exceeds 10000 entries');
				return;
			}
			const at = `${where}[${i}]`;
			if (choices) checkWhen(entry.when, choices, `${at}.when`);
			if (isGroup(entry)) {
				walk(entry.items, choices, `${at}.items`, stack, depth + 1);
				return;
			}
			if (isUse(entry)) {
				const block = blocks[entry.use];
				if (!block) {
					errors.add(`${at}: unknown block "${entry.use}"`);
					return;
				}
				if (stack.includes(entry.use)) {
					errors.add(`blocks.${entry.use}: uses itself (${[...stack, entry.use].join(' → ')})`);
					return;
				}
				const inner = [...stack, entry.use];
				walk(block.items, choices, `blocks.${entry.use}`, inner, depth + 1);
				return;
			}
			checkItem(entry, at);
		});
	};

	for (const [dayKey, day] of Object.entries(routine.days)) {
		const choices = day.choices ?? {};
		const earlier: Record<string, Choice> = {};
		for (const [name, choice] of Object.entries(choices)) {
			const where = `days.${dayKey}.choices.${name}`;
			// A choice can only depend on the ones listed before it.
			checkWhen(choice.active_when, earlier, `${where}.active_when`);
			const options = choice.options ?? {};
			const isToggle = choice.type === 'toggle';
			const valid = (value: unknown, weekday: string) => {
				if (isToggle) return typeof value === 'boolean';
				const option = options[value as string];
				return !!option && (!option.only_on || option.only_on.includes(weekday as never));
			};
			if (typeof choice.default === 'object') {
				for (const weekday of day.on) {
					const value = choice.default[weekday];
					if (value === undefined) errors.add(`${where}.default: missing a value for ${weekday}`);
					else if (!valid(value, weekday))
						errors.add(`${where}.default.${weekday}: "${value}" is not available on ${weekday}`);
				}
			} else {
				for (const weekday of day.on) {
					if (!valid(choice.default, weekday))
						errors.add(`${where}.default: "${choice.default}" is not available on ${weekday}`);
				}
			}
			earlier[name] = choice;
		}
		walk(day.items, choices, `days.${dayKey}.items`, []);
	}

	// Unused blocks still need valid links, references, and nesting. Choice conditions
	// are checked in each consuming template, where the available choices are known.
	for (const [name, block] of Object.entries(blocks)) {
		if (block.category !== undefined && !Object.hasOwn(categories, block.category))
			errors.add(`blocks.${name}: unknown category "${block.category}"`);
		const relative = (entries: Entry[]) => {
			for (const entry of entries) {
				if ('time' in entry)
					errors.add(`blocks.${name}: set the start time in the template, not inside a shared block`);
				if (isGroup(entry)) relative(entry.items);
			}
		};
		relative(block.items);
		walk(block.items, undefined, `blocks.${name}`, [name]);
	}

	return [...errors];
}
