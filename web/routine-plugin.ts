/**
 * Validates ../routine.default.json against
 * ../routine.schema.json and its cross-references on every build, so invalid data fails the build.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { validateRoutine } from './src/lib/routine/validate.ts';

export const ROUTINE_PATH = fileURLToPath(new URL('../routine.default.json', import.meta.url));
export const SCHEMA_PATH = fileURLToPath(new URL('../routine.schema.json', import.meta.url));

/** Reads and validates the routine; throws with every problem found. */
export function loadRoutine(path = ROUTINE_PATH): unknown {
	const data = JSON.parse(readFileSync(path, 'utf8'));
	const errors = validateRoutine(data, JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));
	if (errors.length > 0) {
		throw new Error(`routine.default.json is invalid:\n  - ${errors.join('\n  - ')}`);
	}
	return data;
}

export function routine(): Plugin {
	return {
		name: 'dayspec-routine',
		generateBundle() {
			// The Go executable embeds these files with the frontend build.
			for (const path of [ROUTINE_PATH, SCHEMA_PATH]) {
				this.emitFile({
					type: 'asset',
					fileName: path.split('/').at(-1)!,
					source: readFileSync(path, 'utf8')
				});
			}
		},
		buildStart() {
			this.addWatchFile(ROUTINE_PATH);
			this.addWatchFile(SCHEMA_PATH);
			loadRoutine();
		}
	};
}
