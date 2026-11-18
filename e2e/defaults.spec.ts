import { expect, test } from '@playwright/test';

test('saves weekday defaults for all choices and toggles while keeping daily overrides', async ({
	page,
	request
}) => {
	const original = await (await request.get('/api/routine')).json();
	try {
		const routine = {
			settings: { automatic_swedish_holidays: false },
			days: {
				work: {
					on: ['mon', 'tue', 'wed', 'thu', 'fri'],
					items: [],
					choices: {
						place: {
							label: 'Work location',
							options: { office: { label: 'Office' }, home: { label: 'Home' } },
							default: 'office'
						},
						outing: {
							label: 'Going out',
							options: { staying: { label: 'Staying in' }, out: { label: 'Going out' } },
							default: 'staying'
						},
						exercise: { label: 'Exercise', type: 'toggle', default: false }
					}
				}
			}
		};
		expect(
			(
				await request.put('/api/routine', {
					headers: { 'If-Match': original.revision },
					data: { routine }
				})
			).ok()
		).toBeTruthy();
		await page.clock.setFixedTime(new Date('2026-11-18T12:00:00+01:00'));
		await page.goto('/templates');
		await page.getByTestId('Templates-row-work').getByTestId('Templates-edit').click();
		for (const name of ['place', 'outing', 'exercise']) {
			const editor = page.getByTestId(`ChoiceEditor-${name}`);
			await editor.getByTestId('ChoiceEditor-open').click();
			await expect(editor.getByTestId('ChoiceEditor-default-mode')).toHaveValue('same');
			await editor.getByTestId('ChoiceEditor-default-mode').selectOption('weekday');
			await expect(editor.getByTestId('ChoiceEditor-default')).toHaveCount(5);
		}
		const place = page.getByTestId('ChoiceEditor-place');
		await place.getByLabel('Default · Wed', { exact: true }).selectOption('home');
		await place.getByLabel('Default · Fri', { exact: true }).selectOption('home');
		await page
			.getByTestId('ChoiceEditor-outing')
			.getByLabel('Default · Fri', { exact: true })
			.selectOption('out');
		await page
			.getByTestId('ChoiceEditor-exercise')
			.getByLabel('Default · Wed', { exact: true })
			.selectOption('true');
		await page.getByTestId('TemplateEditor-save').click();
		await expect(page.getByTestId('Templates-saved')).toBeVisible();
		const saved = (await (await request.get('/api/routine')).json()).routine.days.work.choices;
		expect(saved.place.default).toEqual({
			mon: 'office',
			tue: 'office',
			wed: 'home',
			thu: 'office',
			fri: 'home'
		});
		expect(saved.outing.default).toEqual({
			mon: 'staying',
			tue: 'staying',
			wed: 'staying',
			thu: 'staying',
			fri: 'out'
		});
		expect(saved.exercise.default).toEqual({ mon: false, tue: false, wed: true, thu: false, fri: false });
		await page.reload();
		await page.getByTestId('Templates-row-work').getByTestId('Templates-edit').click();
		await page.getByTestId('ChoiceEditor-place').getByTestId('ChoiceEditor-open').click();
		await expect(page.getByTestId('ChoiceEditor-place').getByTestId('ChoiceEditor-default-mode')).toHaveValue(
			'weekday'
		);
		await expect(
			page.getByTestId('ChoiceEditor-place').getByLabel('Default · Wed', { exact: true })
		).toHaveValue('home');
		await page.getByTestId('TemplateEditor-cancel').click();
		await page.goto('/');
		await expect(page.getByTestId('Day-choice-place-home')).toHaveAttribute('aria-checked', 'true');
		await expect(page.getByRole('switch', { name: 'Exercise', exact: true })).toBeChecked();
		await page.getByTestId('Day-choice-place-office').click();
		await page.reload();
		await expect(page.getByTestId('Day-choice-place-office')).toHaveAttribute('aria-checked', 'true');
		await page.clock.setFixedTime(new Date('2026-11-20T12:00:00+01:00'));
		await page.reload();
		await expect(page.getByTestId('Day-choice-place-home')).toHaveAttribute('aria-checked', 'true');
		await expect(page.getByTestId('Day-choice-outing-out')).toHaveAttribute('aria-checked', 'true');
		await expect(page.getByRole('switch', { name: 'Exercise', exact: true })).not.toBeChecked();
	} finally {
		const current = await (await request.get('/api/routine')).json();
		expect(
			(
				await request.put('/api/routine', {
					headers: { 'If-Match': current.revision },
					data: { routine: original.routine }
				})
			).ok()
		).toBeTruthy();
	}
});
