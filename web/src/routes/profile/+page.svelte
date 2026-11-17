<script lang="ts">
	import { templateName } from '#lib/routine/edit.ts';
	import BottomNav from '#lib/components/BottomNav.svelte';
	import { routineState, saveRoutine } from '#lib/routine/client.ts';
	let saving = $state(false);
	let error = $state('');
	let pending = $state(true);
	let pendingHoliday = $state('');
	const automatic = $derived($routineState.routine.settings?.automatic_swedish_holidays !== false);
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
</script>

<section class="masthead"><h1>Profile</h1></section>
<section class="settings">
	<h2>Settings</h2>
	<label class="setting">
		<span>Use automatic Swedish holidays</span>
		<input
			type="checkbox"
			role="switch"
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
	{#if saving}<p role="status">Saving…</p>{/if}
	{#if error}<p class="error" role="alert" data-testid="Profile-error">{error}</p>{/if}
</section>
<div class="bar-room"></div>
<BottomNav />

<style>
	.settings {
		margin-top: 1.5rem;
		padding: 1.25rem;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: var(--radius);
	}
	h2 {
		margin: 0 0 1rem;
		font-size: 1rem;
	}
	.setting {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		min-height: 44px;
		font-size: 0.9rem;
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
	input {
		appearance: none;
		flex: none;
		width: 46px;
		height: 28px;
		margin: 0;
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: var(--inset);
		position: relative;
		cursor: pointer;
	}
	input::after {
		content: '';
		position: absolute;
		width: 20px;
		height: 20px;
		top: 3px;
		left: 3px;
		border-radius: 50%;
		background: var(--muted);
		transition: transform 0.2s;
	}
	input:checked {
		background: var(--accent);
		border-color: var(--accent);
	}
	input:checked::after {
		transform: translateX(18px);
		background: var(--accent-text);
	}
	input:disabled {
		opacity: 0.5;
		cursor: default;
	}
	p {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.error {
		color: var(--danger);
	}
</style>
