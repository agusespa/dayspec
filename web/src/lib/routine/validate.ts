/**
 * Validation of the bundled routine and template edits: the JSON Schema first, then the cross-references the
 * schema can't express. Used by the Vite plugin (vite.config.ts) the editor and the tests.
 */
import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import {
	WEEKDAYS,
	isBranch,
	isUse,
	type Choice,
	type Entry,
	type Activity,
	type SharedEntry,
	type Routine
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
	const checkItem = (item: Activity, where: string) => {
		if (item.category !== undefined && !Object.hasOwn(categories, item.category))
			errors.add(`${where}: unknown category "${item.category}"`);
		if (item.link !== undefined) {
			try {
				const url = new URL(item.link);
				if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
			} catch {
				errors.add(`${where}: invalid link URL`);
			}
		}
	};

	let remaining = 10_000;
	const walk = (
		entries: (Entry | SharedEntry)[],
		choices: Record<string, Choice> | undefined,
		where: string,
		stack: string[],
		depth = 0,
		forks: string[] = []
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
			if (isBranch(entry)) {
				const definition = choices?.[entry.alternative];
				if (!definition) errors.add(`${at}: unknown alternative "${entry.alternative}"`);
				if (forks.includes(entry.alternative))
					errors.add(`${at}: an alternative cannot be nested inside itself`);
				for (const [option, items] of Object.entries(entry.paths)) {
					if (definition && !Object.hasOwn(definition.options, option))
						errors.add(`${at}.paths: "${option}" is not an option of "${entry.alternative}"`);
					walk(items, choices, `${at}.paths.${option}`, stack, depth + 1, [...forks, entry.alternative]);
				}
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
				walk(block.items, undefined, `blocks.${entry.use}`, inner, depth + 1);
				return;
			}
			checkItem(entry, at);
		});
	};

	for (const [dayKey, day] of Object.entries(routine.days)) {
		const choices = day.choices ?? {};
		for (const [name, choice] of Object.entries(choices)) {
			const where = `days.${dayKey}.choices.${name}`;
			const options = choice.options ?? {};
			const valid = (value: unknown, weekday: string) => {
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
		}
		walk(day.items, choices, `days.${dayKey}.items`, []);
	}

	// Shared blocks are unconditional; validate references and links even when unused.
	for (const [name, block] of Object.entries(blocks)) {
		if (block.category !== undefined && !Object.hasOwn(categories, block.category))
			errors.add(`blocks.${name}: unknown category "${block.category}"`);

		walk(block.items, undefined, `blocks.${name}`, [name]);
	}

	return [...errors];
}
