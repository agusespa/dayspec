<script lang="ts">
	import type { ResolvedItem } from '#lib/routine/resolve.ts';
	import { googleCalendarUrl } from '#lib/routine/calendar.ts';
	let { date, items, title }: { date?: string; items: ResolvedItem[]; title: string } = $props();
	const href = $derived(date ? googleCalendarUrl(date, items, title) : undefined);
</script>

{#if href}
	<a
		class="calendar-link"
		{href}
		target="_blank"
		rel="noopener noreferrer"
		aria-label={`Add ${title} to Google Calendar`}
		title="Add to Google Calendar"
		onclick={(event) => event.stopPropagation()}
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<rect x="3" y="5" width="18" height="16" rx="3" />
			<path d="M16 3v4M8 3v4M3 11h18M12 14v4M10 16h4" />
		</svg>
	</a>
{/if}

<style>
	.calendar-link {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		color: var(--accent);
	}
	.calendar-link:hover {
		background: var(--surface-hover);
	}
	svg {
		width: 19px;
		height: 19px;
	}
</style>
