/**
 * Bundles ../routine.default.json and ../routine.schema.json with the frontend build for the Go executable to
 * embed. The Go tests validate both files; the server refuses to start with invalid defaults.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const ROUTINE_PATH = fileURLToPath(new URL('../routine.default.json', import.meta.url));
export const SCHEMA_PATH = fileURLToPath(new URL('../routine.schema.json', import.meta.url));

export function routine(): Plugin {
	return {
		name: 'dayspec-routine',
		generateBundle() {
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
		}
	};
}
