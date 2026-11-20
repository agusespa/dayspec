<script lang="ts">
	import Dialog from './Dialog.svelte';
	let {
		title,
		message,
		cancelLabel = 'Cancel',
		confirmLabel = 'Delete',
		returnFocus,
		oncancel,
		onconfirm
	}: {
		title: string;
		message: string;
		cancelLabel?: string;
		confirmLabel?: string;
		returnFocus?: HTMLElement;
		oncancel: () => void;
		onconfirm: () => void;
	} = $props();
</script>

<Dialog {title} description={message} {returnFocus} {oncancel}>
	{#snippet actions()}
		<button type="button" class="cancel" onclick={oncancel}>{cancelLabel}</button>
		<button type="button" class="confirm" onclick={onconfirm}>{confirmLabel}</button>
	{/snippet}
</Dialog>

<style>
	button {
		padding-inline: 1rem;
		font-size: var(--text-sm);
	}
	.cancel {
		border: 1px solid var(--rule);
		background: var(--inset);
	}
	.confirm {
		background: var(--danger);
		color: var(--accent-text);
	}
	.confirm:hover {
		background: color-mix(in srgb, var(--danger), white 12%);
	}
</style>
