<script lang="ts">
	import type { Snippet } from 'svelte';
	import { branchOptions } from '#lib/routine/branches.ts';
	import { humanize } from '#lib/routine/resolve.ts';
	import type { Choice, ChoiceValue } from '#lib/routine/types.ts';
	let {
		name,
		choice,
		preferred,
		details,
		actions,
		children
	}: {
		name: string;
		choice: Choice;
		preferred?: ChoiceValue;
		details?: Snippet<[ChoiceValue]>;
		actions?: Snippet;
		children: Snippet<[ChoiceValue]>;
	} = $props();
	let selected = $state<ChoiceValue>();
	const options = $derived(branchOptions(choice));
	const value = $derived(
		options.find((o) => o.value === selected)?.value ??
			options.find((o) => o.value === preferred)?.value ??
			options[0]?.value
	);
	// Keep an activity visible when its selected path changes during editing.
	$effect(() => {
		if (preferred !== undefined) selected = preferred;
	});
</script>

<section class="branch-section" aria-label={choice.label ?? humanize(name)} data-testid="BranchSection">
	<header class="branch-heading">
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"><path d="M12 21v-9m0 0L4 4m8 8 8-8M4 9V4h5M15 4h5v5" /></svg
		>
		<span>{choice.label ?? humanize(name)}</span>
		{@render actions?.()}
	</header>
	<div class="branch-options" role="group" aria-label={`${choice.label ?? humanize(name)} alternatives`}>
		{#each options as option}
			<button
				type="button"
				class:chosen={value === option.value}
				aria-pressed={value === option.value}
				onclick={() => (selected = option.value)}
			>
				{option.label}
			</button>
		{/each}
	</div>
	{#if value !== undefined}{@render details?.(value)}{/if}
	<div class="branch-content">
		{#if value !== undefined}{@render children(value)}{/if}
	</div>
	<div class="branch-join" aria-hidden="true"><span></span></div>
</section>
