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

	/** Brings the current item into view, leaving the page alone when its row is already visible. */
	async function scrollToCurrent(behavior: ScrollBehavior) {
		await tick();
		const current = document.querySelector('[data-current]');
		if (!current) return;
		const row = (current.querySelector('.row') ?? current).getBoundingClientRect();
		const headerBottom = document.querySelector('.page-header')?.getBoundingClientRect().bottom ?? 0;
		const barTop = document.querySelector('.bottombar')?.getBoundingClientRect().top ?? innerHeight;
		if (row.top >= headerBottom && row.bottom <= barTop) return;
		current.scrollIntoView({ block: 'center', behavior });
	}

	function goToday() {
		show(today);
		scrollToCurrent('smooth');
	}

	onMount(() => {
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
			clearInterval(interval);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

<div class="page-header">
	<section class="masthead">
		<p class="eyebrow">{formatDate(date, 'long')}</p>
		<h1>{isToday ? 'Today' : formatDate(date, 'long').split(' ')[0]}</h1>
		{#if day.theme}
			<p class="theme">{day.theme}</p>
		{/if}
		<div class="strip" aria-hidden="true">
			{#each day.items as item, i (item.id)}
				<span
					class="seg tone-{item.color ?? 'none'}"
					class:passed={i < passed}
					class:now={i === current.index}
				></span>
			{/each}
		</div>
	</section>

	<section class="choices" aria-label="Day options">
		<label class="choice">
			<span class="choice-label">Holiday</span>
			<span class="holiday-control">
				<input
					type="checkbox"
					role="switch"
					class="switch"
					data-testid="Day-holiday-toggle"
					checked={day.holiday}
					onchange={(e) => setHoliday(e.currentTarget.checked)}
				/>
				{#if stored.holiday === undefined && day.holiday && holidayName && routine.settings?.automatic_swedish_holidays !== false}
					<span class="holiday-source" data-testid="Day-holiday-source">
						Automatic · {holidayName}
					</span>
				{/if}
			</span>
		</label>
		{#each day.choices as choice (choice.name)}
			{#if choice.type === 'toggle'}
				<label class="choice">
					<span class="choice-label">{choice.label}</span>
					<input
						type="checkbox"
						role="switch"
						class="switch"
						data-testid={`Day-choice-${choice.name}`}
						checked={choice.value === true}
						onchange={(e) => choose(choice.name, e.currentTarget.checked)}
					/>
				</label>
			{:else}
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
			{/if}
		{/each}
	</section>
</div>

{#if !day.items.length}
	<section class="empty-state" data-testid="Day-empty">
		<h2>{day.template ? 'Your routine starts here' : 'No template for this day'}</h2>
		<p>Add your first item in Templates to build a day that works for you.</p>
		<a href="/templates" data-testid="Day-create">Open templates</a>
	</section>
{/if}
<Timeline
	items={day.items}
	calendarDate={date}
	editTemplate={day.template}
	currentId={day.items[current.index]?.id}
>
	{#snippet row(item)}
		{@const i = day.items.indexOf(item)}
		{@const isCurrent = i === current.index}
		<TimelineItem
			{item}
			calendarDate={date}
			editTemplate={day.template}
			current={isCurrent ? (current.upcoming ? 'Next' : 'Now') : undefined}
			passed={i < passed}
		/>
	{/snippet}
</Timeline>

<div class="bar-room"></div>

<BottomNav>
	<div class="day-navigation" aria-label="Day controls">
		<button class="nav" aria-label="Previous day" onclick={() => show(addDays(date, -1))}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
		</button>
		<div class="bar-center">
			{#if isToday}
				<span class="day-label current-day-label" aria-current="page"
					><span>Daily</span><small>{formatDate(date, 'short').split(' ').slice(1).join(' ')}</small></span
				>
				<button
					class="day-label current-day-button"
					aria-label="Go to current activity"
					aria-current="page"
					title="Go to today's current activity"
					data-testid="Day-current"
					onclick={goToday}
					><span>Daily</span><small>{formatDate(date, 'short').split(' ').slice(1).join(' ')}</small></button
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
	.masthead {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: baseline;
		column-gap: 0.75rem;
	}

	.masthead h1 {
		grid-column: 1;
		grid-row: 1;
		margin: 0;
	}

	.eyebrow {
		grid-column: 2;
		grid-row: 1;
		text-align: right;
		line-height: 1.4;
	}

	.theme {
		grid-column: 1 / -1;
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem 1.25rem;
		padding: 0.3rem 0;
		overflow: hidden;
		border-bottom: 1px solid var(--rule);
	}

	.choice {
		display: flex;
		flex-wrap: wrap;
		position: relative;
		max-width: 100%;
		min-width: 0;
		min-height: 40px;
		gap: 0.5rem;
		padding: 0.1rem 0;
		border-bottom: 0;
	}

	.choice::before {
		content: '';
		position: absolute;
		left: -0.625rem;
		top: 50%;
		height: 20px;
		border-left: 1px solid var(--rule);
		transform: translateY(-50%);
	}

	.choice-label {
		overflow-wrap: anywhere;
	}

	.options {
		min-width: 0;
		gap: 0.3rem;
	}

	.options button {
		min-height: 32px;
		padding: 0.15rem 0.6rem;
		font-size: var(--text-xs);
		overflow-wrap: anywhere;
	}

	.strip {
		grid-column: 1 / -1;
		display: flex;
		gap: 2px;
		height: 8px;
		margin-top: 1.25rem;
	}

	.seg {
		flex: 1;
		border-radius: 2px;
		background: var(--tone);
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

	.holiday-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.holiday-source {
		line-height: 1.4;
		font-size: var(--text-xs);
		color: var(--muted);
	}
</style>
