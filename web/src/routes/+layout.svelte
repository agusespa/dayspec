<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { loadRoutine, routineState, startRoutineRefresh } from '#lib/routine/client.ts';
	import '#lib/styles/chrome.css';
	import '#lib/styles/timeline.css';
	import PullToRefresh from '#lib/components/PullToRefresh.svelte';
	import type { LayoutProps } from './$types';

	onMount(startRoutineRefresh);

	const TABS = ['/', '/templates', '/profile'];

	// Switching tabs slides the page toward the tab that was tapped (Safari 18+, Chrome);
	// browsers without view transitions just switch.
	onNavigate((nav) => {
		const from = TABS.indexOf(nav.from?.url.pathname ?? '');
		const to = TABS.indexOf(nav.to?.url.pathname ?? '');
		if (from < 0 || to < 0 || from === to || !document.startViewTransition) return;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		document.documentElement.dataset.tabDir = to > from ? 'forward' : 'back';
		return new Promise((resolve) => {
			const t = document.startViewTransition(async () => {
				resolve();
				await nav.complete;
			});
			t.finished.finally(() => delete document.documentElement.dataset.tabDir);
		});
	});

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<title>Dayspec</title>
</svelte:head>

<main>
	{#if $routineState.loading}
		<p class="banner" role="status">Loading routine…</p>
	{:else if !$routineState.revision}
		<p class="banner" role="status" data-testid="Routine-unavailable">
			Routine unavailable. Retry when you’re connected.
		</p>
	{:else}
		{@render children()}
	{/if}
</main>

<PullToRefresh />

{#if $routineState.message}
	<aside class="sync-toast" data-testid="RoutineSync-toast" aria-label="Routine update failed">
		<p role="status">{$routineState.message}</p>
		<div class="toast-actions">
			<button
				data-testid="RoutineSync-retry"
				disabled={$routineState.refreshing}
				onclick={() => loadRoutine()}>{$routineState.refreshing ? 'Retrying…' : 'Retry'}</button
			>
			<button
				data-testid="RoutineSync-dismiss"
				aria-label="Dismiss update notification"
				onclick={() => routineState.update((state) => ({ ...state, message: '' }))}>Dismiss</button
			>
		</div>
	</aside>
{/if}

<style>
	.sync-toast {
		position: fixed;
		left: 50%;
		bottom: calc(max(env(safe-area-inset-bottom), 24px) + 6rem);
		transform: translateX(-50%);
		z-index: 21;
		width: min(calc(100% - 2rem), 440px);
		padding: 0.9rem 1rem;
		border: 1px solid var(--rule);
		border-radius: 10px;
		background: var(--paper);
		color: var(--text);
		box-shadow: var(--shadow);
	}
	.sync-toast p {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.6;
	}
	.toast-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}
	.toast-actions button {
		color: var(--accent);
		font-size: var(--text-xs);
		min-height: 44px;
	}
	.toast-actions button:disabled {
		opacity: 0.5;
	}

	main {
		max-width: 720px;
		margin: 0 auto;
		padding: 0 1rem calc(env(safe-area-inset-bottom) + 2rem);
	}

	.banner {
		background: var(--paper);
		border: 1px solid var(--danger);
		border-radius: var(--radius);
		padding: 0.75rem;
		margin-top: var(--page-top);
	}
</style>
