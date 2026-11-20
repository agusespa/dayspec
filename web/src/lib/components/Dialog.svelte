<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	let {
		title,
		description,
		width = '380px',
		returnFocus,
		oncancel,
		onkeydown,
		children,
		actions
	}: {
		title: string;
		description?: string;
		width?: string;
		returnFocus?: HTMLElement;
		oncancel: () => void;
		onkeydown?: (event: KeyboardEvent) => void;
		children?: Snippet;
		actions: Snippet;
	} = $props();
	const id = $props.id();
</script>

<dialog
	aria-labelledby={`${id}-title`}
	aria-describedby={description ? `${id}-description` : undefined}
	style:--dialog-width={width}
	{onkeydown}
	oncancel={(event) => {
		event.preventDefault();
		oncancel();
	}}
	{@attach (node) => {
		node.showModal();
		// Slotted field components may finish mounting after the dialog opens.
		void tick().then(() => {
			if (node.isConnected && node.open)
				node.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true });
		});
		return () => {
			node.close();
			if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
		};
	}}
>
	<header class="dialog-heading"><h2 id={`${id}-title`}>{title}</h2></header>
	<div class="dialog-content">
		{#if description}<p id={`${id}-description`}>{description}</p>{/if}
		{@render children?.()}
	</div>
	<footer>{@render actions()}</footer>
</dialog>

<style>
	dialog {
		width: min(calc(100% - 2rem), var(--dialog-width));
		max-width: none;
		max-height: calc(100dvh - 2rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
		margin: auto;
		padding: 0;
		border: 1px solid var(--surface-hover);
		border-radius: 16px;
		background: var(--paper);
		color: var(--text);
		box-shadow: 0 24px 80px rgb(0 0 0 / 60%);
	}
	dialog[open] {
		display: flex;
		flex-direction: column;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 65%);
		-webkit-backdrop-filter: blur(6px);
		backdrop-filter: blur(6px);
	}
	header,
	footer {
		flex: none;
		padding: 1.2rem 1.4rem;
	}
	header {
		padding-bottom: 0;
	}
	.dialog-heading h2 {
		margin: 0;
		font-family: var(--sans);
		font-size: var(--text-lg);
		font-weight: 650;
		letter-spacing: -0.02em;
	}
	p {
		margin: 0.65rem 0 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--muted);
	}
	.dialog-content {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 1.4rem;
	}
	footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.65rem;
	}
</style>
