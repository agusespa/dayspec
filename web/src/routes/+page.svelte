<script lang="ts">
	import BottomNav from '#lib/components/BottomNav.svelte';
	import { routineState } from '#lib/routine/client.ts';
	import { onMount, tick, untrack } from 'svelte';
	import { addDays, formatDate, logicalNow, logicalToday } from '#lib/routine/date.ts';
	import { currentIndex, dayStartsAt, resolveDay } from '#lib/routine/resolve.ts';
	import type { ChoiceValue } from '#lib/routine/types.ts';
	import { loadDay, saveDay } from '#lib/storage.ts';
	import { getSwedishPublicHolidayName } from '#lib/routine/swedish-holidays.ts';
	import Timeline from '#lib/components/Timeline.svelte';
	import TimelineItem from '#lib/components/TimelineItem.svelte';

	const routine = $derived($routineState.routine);
	const start = $derived(dayStartsAt(routine));
	const firstDate = untrack(() => logicalToday(new Date(), start));

	let now = $state(new Date());
	let date = $state(firstDate);
	let stored = $state(loadDay(firstDate));
	const today = $derived(logicalToday(now, start));
	const isToday = $derived(date === today);
	const day = $derived(resolveDay(routine, date, stored));
	const holidayName = $derived(getSwedishPublicHolidayName(date));
	const current = $derived(
		isToday ? currentIndex(day.items, logicalNow(now, start)) : { index: -1, upcoming: false }
	);
	/** Items before this index have passed; with no current item, none have. */
	const passed = $derived(current.upcoming ? 0 : current.index);

	function show(next: string) {
		date = next;
		stored = loadDay(next);
	}

	function persist() {
		saveDay(date, $state.snapshot(stored));
	}

	function choose(name: string, value: ChoiceValue) {
		stored.choices = { ...stored.choices, [name]: value };
		persist();
	}

	function setHoliday(on: boolean | undefined) {
		stored.holiday = on;
		persist();
	}

	async function scrollToCurrent(behavior: ScrollBehavior) {
		await tick();
		document.querySelector('[data-current]')?.scrollIntoView({ block: 'center', behavior });
	}

	function goToday() {
		show(today);
		scrollToCurrent('smooth');
	}

	onMount(() => {
		// A task later: on start-up SvelteKit restores the saved scroll position after mounting.
		const initialScroll = setTimeout(() => scrollToCurrent('instant'));
		// Keep the highlight on the clock, and follow today across midnight (or a phone left asleep).
		const refresh = () => {
			const wasToday = date === today;
			now = new Date();
			if (wasToday && date !== today) show(today);
		};
		const interval = setInterval(refresh, 30_000);
		const onVisible = () => {
			if (document.visibilityState === 'visible') refresh();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearTimeout(initialScroll);
			clearInterval(interval);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

<section class="masthead">
	<p class="eyebrow">{formatDate(date, 'long')}</p>
	<h1>{isToday ? 'Today' : formatDate(date, 'long').split(' ')[0]}</h1>
	{#if day.theme}
		<p class="theme">{day.theme}</p>
	{/if}
	<div class="strip" aria-hidden="true">
		{#each day.items as item, i (item.id)}
			<span class="seg kind-{item.kind ?? 'none'}" class:passed={i < passed} class:now={i === current.index}
			></span>
		{/each}
	</div>
</section>

<section class="choices" aria-label="Day options">
	{#each day.choices as choice (choice.name)}
		<div class="choice">
			<span class="choice-label" id="choice-{choice.name}">{choice.label}</span>
			<div class="options" role="radiogroup" aria-labelledby="choice-{choice.name}">
				{#each choice.options as option (String(option.value))}
					<button
						data-testid={`Day-choice-${choice.name}-${String(option.value)}`}
						role="radio"
						aria-checked={option.value === choice.value}
						onclick={() => choose(choice.name, option.value)}>{option.label}</button
					>
				{/each}
			</div>
		</div>
	{/each}
	<div class="choice holiday">
		<label>
			<span class="choice-label">Holiday</span>
			<input
				type="checkbox"
				role="switch"
				data-testid="Day-holiday-toggle"
				checked={day.holiday}
				onchange={(e) => setHoliday(e.currentTarget.checked)}
			/>
		</label>
		{#if stored.holiday === undefined && day.holiday && holidayName && routine.settings?.automatic_swedish_holidays !== false}
			<span class="holiday-source" data-testid="Day-holiday-source">
				Automatic · {holidayName}
			</span>
		{/if}
	</div>
</section>

{#if !day.items.length}
	<section class="empty-state" data-testid="Day-empty">
		<h2>{day.template ? 'Your routine starts here' : 'No template for this day'}</h2>
		<p>Add your first item in Templates to build a day that works for you.</p>
		<a href="/templates" data-testid="Day-create">Open templates</a>
	</section>
{/if}
<Timeline items={day.items} currentId={day.items[current.index]?.id}>
	{#snippet row(item)}
		{@const i = day.items.indexOf(item)}
		{@const isCurrent = i === current.index}
		<TimelineItem
			{item}
			current={isCurrent ? (current.upcoming ? 'Next' : 'Now') : undefined}
			passed={i < passed}
		/>
	{/snippet}
</Timeline>

<p class="version mono">Dayspec {__APP_VERSION__}</p>
<div class="bar-room"></div>

<BottomNav>
	<div class="day-navigation" aria-label="Day controls">
		<button class="nav" aria-label="Previous day" onclick={() => show(addDays(date, -1))}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
		</button>
		<div class="bar-center">
			{#if isToday}
				<span class="day-label" aria-current="page"
					><span>Daily</span><small>{formatDate(date, 'short').split(' ').slice(1).join(' ')}</small></span
				>
			{:else}
				<button class="day-label" aria-label="Back to today" data-testid="Day-today" onclick={goToday}
					><span>Daily</span><small>{formatDate(date, 'short').split(' ').slice(1).join(' ')}</small></button
				>
			{/if}
		</div>
		<button class="nav" aria-label="Next day" data-testid="Day-next" onclick={() => show(addDays(date, 1))}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
		</button>
	</div>
</BottomNav>

<style>
	.strip {
		display: flex;
		gap: 2px;
		height: 8px;
		margin-top: 1.25rem;
	}

	.seg {
		flex: 1;
		border-radius: 2px;
		background: var(--kind);
		opacity: 0.22;
		transition: opacity 0.2s;
	}

	.seg.passed {
		opacity: 1;
	}

	.seg.now {
		box-shadow:
			0 0 0 1.5px var(--bg),
			0 0 0 3px var(--accent);
	}

	.holiday {
		grid-template-columns: 4.75rem 46px minmax(0, 1fr);
		column-gap: 0.6rem;
		min-height: 52px;
		cursor: pointer;
	}

	.holiday .choice-label {
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: 0;
	}

	.holiday label {
		display: contents;
	}

	.holiday-source {
		grid-column: 3;
		grid-row: 1;
		line-height: 1.4;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.holiday input {
		appearance: none;
		justify-self: start;
		width: 46px;
		height: 28px;
		margin: 0;
		border-radius: 999px;
		border: 1px solid var(--rule);
		background: var(--paper);
		position: relative;
		transition: background 0.2s;
	}

	.holiday input::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 999px;
		background: var(--muted);
		transition:
			transform 0.2s,
			background 0.2s;
	}

	.holiday input:checked {
		background: var(--accent);
		border-color: var(--accent);
	}

	.holiday input:checked::after {
		background: var(--accent-text);
		transform: translateX(18px);
	}

	.version {
		text-align: center;
		font-size: 0.68rem;
		color: var(--muted);
		margin: 1.5rem 0 0;
	}
</style>
