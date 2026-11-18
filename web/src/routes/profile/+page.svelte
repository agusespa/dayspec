<script lang="ts">
	import { templateName } from '#lib/routine/edit.ts';
	import BottomNav from '#lib/components/BottomNav.svelte';
	import { routineState, saveRoutine } from '#lib/routine/client.ts';
	import { version } from '$app/env';
	let saving = $state(false);
	let error = $state('');
	let pending = $state(true);
	let pendingHoliday = $state('');
	const calendar = $derived($routineState.routine.settings?.calendar ?? 'google');
	const automatic = $derived($routineState.routine.settings?.automatic_swedish_holidays !== false);
	// SvelteKit's build version is the build's timestamp; it tells two builds of one release apart.
	const builtMs = Number(version);
	const builtAt = Number.isFinite(builtMs)
		? new Date(builtMs).toLocaleString(undefined, {
				day: 'numeric',
				month: 'short',
				year: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			})
		: null;
	async function setAutomatic(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const enabled = input.checked;
		pending = enabled;
		pendingHoliday = $routineState.routine.settings?.holiday ?? '';
		const { routine, revision } = $routineState;
		saving = true;
		error = '';
		try {
			await saveRoutine(
				{ ...routine, settings: { ...routine.settings, automatic_swedish_holidays: enabled } },
				revision
			);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not save settings.';
		} finally {
			saving = false;
		}
	}
	async function setHoliday(event: Event) {
		const input = event.currentTarget as HTMLSelectElement;
		pendingHoliday = input.value;
		pending = automatic;
		const { routine, revision } = $routineState;
		const settings = { ...routine.settings };
		if (input.value) settings.holiday = input.value;
		else delete settings.holiday;
		saving = true;
		error = '';
		try {
			await saveRoutine({ ...routine, settings }, revision);
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			saving = false;
		}
	}
	async function setCalendar() {
		pending = automatic;
		pendingHoliday = $routineState.routine.settings?.holiday ?? '';
		const { routine, revision } = $routineState;
		saving = true;
		error = '';
		try {
			await saveRoutine({ ...routine, settings: { ...routine.settings, calendar: 'google' } }, revision);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not save settings.';
		} finally {
			saving = false;
		}
	}
</script>

<section class="masthead">
	<p class="eyebrow">Preferences</p>
	<h1>Profile</h1>
</section>
<section class="settings">
	<h2>Settings</h2>
	<label class="setting">
		<span>Use automatic Swedish holidays</span>
		<input
			type="checkbox"
			role="switch"
			class="switch"
			data-testid="Profile-automatic-holidays"
			checked={saving ? pending : automatic}
			onchange={setAutomatic}
			disabled={saving || !$routineState.online}
		/>
	</label>
	<label class="setting"
		><span>Holiday template</span><select
			data-testid="Profile-holiday-template"
			disabled={saving || !$routineState.online}
			value={saving ? pendingHoliday : ($routineState.routine.settings?.holiday ?? '')}
			onchange={setHoliday}
			><option value="">Regular weekday template</option
			>{#each Object.entries($routineState.routine.days) as [id, day]}<option value={id}
					>{templateName(day.on)}</option
				>{/each}</select
		></label
	>
	<label class="setting"
		><span>Calendar</span><select
			data-testid="Profile-calendar"
			disabled={saving || !$routineState.online}
			value={calendar}
			onchange={setCalendar}><option value="google">Google Calendar</option></select
		></label
	>
	{#if saving}<p role="status">Saving…</p>{/if}
	{#if error}<p class="error" role="alert" data-testid="Profile-error">{error}</p>{/if}
</section>
<p class="version" data-testid="Profile-version">
	Version {__APP_VERSION__}{#if builtAt}<br />Built {builtAt}{/if}
</p>
<div class="bar-room"></div>
<BottomNav />

<style>
	.settings {
		margin-top: 1.5rem;
		padding: 1.25rem;
		background: var(--paper);
		border: 1px solid var(--rule);
		border-radius: var(--radius);
	}
	h2 {
		margin: 0 0 1rem;
		font-size: var(--text-md);
	}
	.setting {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		min-height: 44px;
		font-size: var(--text-sm);
		cursor: pointer;
	}
	select {
		max-width: 55%;
		padding: 0.7rem;
		background: var(--inset);
		color: var(--text);
		border: 1px solid var(--rule);
		border-radius: 10px;
		font: inherit;
	}
	.settings p {
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.version {
		margin: 2.5rem 0 0;
		text-align: center;
		font-size: var(--text-xs);
		line-height: 1.6;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.settings .error {
		color: var(--danger);
	}
</style>
