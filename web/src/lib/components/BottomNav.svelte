<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	let { children }: { children?: Snippet } = $props();
	const active = $derived(page.url.pathname === '/profile' ? 2 : page.url.pathname === '/templates' ? 1 : 0);
</script>

<nav class="bottombar" class:daily-expanded={active === 0} aria-label="Main navigation">
	<span
		class="nav-indicator"
		style="--tab-start: {active / 3}; --tab-size: {active === 0 ? 0.46 : 1 / 3}"
		aria-hidden="true"
	></span>
	{#if active === 0 && children}
		{@render children()}
	{:else}
		<a
			class="nav nav-destination"
			href="/"
			data-testid="Nav-daily"
			aria-label="Daily"
			aria-current={active === 0 ? 'page' : undefined}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true"
				><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg
			>
			<span>Daily</span>
		</a>
	{/if}
	<a
		class="nav nav-destination"
		href="/templates"
		data-testid="Nav-templates"
		aria-label="Templates"
		aria-current={active === 1 ? 'page' : undefined}
	>
		<svg viewBox="0 0 24 24" aria-hidden="true"
			><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg
		>
		<span>Templates</span>
	</a>
	<a
		class="nav nav-destination"
		href="/profile"
		data-testid="Nav-profile"
		aria-label="Profile"
		aria-current={active === 2 ? 'page' : undefined}
	>
		<svg viewBox="0 0 24 24" aria-hidden="true"
			><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg
		>
		<span>Profile</span>
	</a>
</nav>
