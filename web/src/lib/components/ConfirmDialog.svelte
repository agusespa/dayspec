<script lang="ts">
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
	const id = $props.id();
</script>

<dialog
	aria-labelledby={`${id}-title`}
	aria-describedby={`${id}-description`}
	oncancel={(event) => {
		event.preventDefault();
		oncancel();
	}}
	{@attach (node) => {
		node.showModal();
		return () => {
			node.close();
			if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
		};
	}}
>
	<h2 id={`${id}-title`}>{title}</h2>
	<p id={`${id}-description`}>{message}</p>
	<div class="actions">
		<button type="button" class="cancel" onclick={oncancel}>{cancelLabel}</button>
		<button type="button" class="confirm" onclick={onconfirm}>{confirmLabel}</button>
	</div>
</dialog>

<style>
	dialog {
		width: min(calc(100% - 2rem), 380px);
		max-width: none;
		margin: auto;
		padding: 1.4rem;
		border: 1px solid var(--surface-hover);
		border-radius: 16px;
		background: var(--paper);
		color: var(--text);
		box-shadow: 0 24px 80px rgb(0 0 0 / 60%);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 65%);
		-webkit-backdrop-filter: blur(6px);
		backdrop-filter: blur(6px);
	}
	dialog h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 650;
		letter-spacing: -0.02em;
	}
	p {
		margin: 0.65rem 0 1.35rem;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--muted);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 0.65rem;
	}
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
