import { humanize } from './resolve.ts';
import type { Branch, Choice, ChoiceValue } from './types.ts';

export interface BranchOption {
	value: ChoiceValue;
	label: string;
}
export function branchOptions(choice: Choice): BranchOption[] {
	return Object.entries(choice.options).map(([value, option]) => ({
		value,
		label: option.label ?? humanize(value)
	}));
}

/** Every option starts as an empty path; nesting is expressed by placing a branch inside one. */
export function newBranch(name: string, choice: Choice): Branch {
	return {
		choice: name,
		paths: Object.fromEntries(Object.keys(choice.options).map((option) => [option, []]))
	};
}
