/**
 * JSON Schema validation of editor drafts, for immediate feedback before saving. The server is the only
 * authority on cross-references (unknown blocks, categories, choices, weekday overlaps) and reports them on save.
 */
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';

const validators = new WeakMap<object, ValidateFunction>();

export function validateRoutine(data: unknown, schema: object): string[] {
	let validate = validators.get(schema);
	if (!validate) {
		const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
		validate = ajv.compile(schema);
		validators.set(schema, validate);
	}
	return validate(data) ? [] : formatSchemaErrors(validate.errors ?? []);
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
					: e.keyword === 'unevaluatedProperties'
						? ` "${(e.params as { unevaluatedProperty: string }).unevaluatedProperty}"`
						: e.keyword === 'enum'
							? `: ${(e.params as { allowedValues: unknown[] }).allowedValues.join(', ')}`
							: '';
			return `${where}: ${e.message}${extra}`;
		});
	return [...new Set(messages)];
}
