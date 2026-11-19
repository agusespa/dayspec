import { expect, test } from '@playwright/test';
test('saves weekday defaults for all alternatives while keeping daily overrides', async ({
	page,
	request,
}) => {
	const original = await (await request.get('/api/routine')).json();
	try {
		const routine = {
			settings: { automatic_swedish_holidays: false },
			days: {
				work: {
					on: ['mon', 'tue', 'wed', 'thu', 'fri'],
					items: [
						{ alternative: 'place', paths: {} },
						{ alternative: 'outing', paths: {} },
						{ alternative: 'exercise', paths: {} },
					],
					choices: {
						place: {
							label: 'Work location',
							options: { office: { label: 'Office' }, home: { label: 'Home' } },
							default: 'office',
						},
						outing: {
							label: 'Going out',
							options: {
								staying: { label: 'Staying in' },
								out: { label: 'Going out' },
							},
							default: 'staying',
						},
						exercise: {
							label: 'Exercise',
							options: { yes: { label: 'Yes' }, no: { label: 'No' } },
							default: 'no',
						},
					},
				},
			},
		};
		expect(
			(
				await request.put('/api/routine', {
					headers: { 'If-Match': original.revision },
					data: { routine },
				})
			).ok(),
		).toBeTruthy();
		await page.clock.setFixedTime(new Date('2026-11-18T12:00:00+01:00'));
		await page.goto('/templates');
		await page
			.getByTestId('Templates-row-work')
			.getByTestId('Templates-edit')
			.click();
		for (const name of ['place', 'outing', 'exercise']) {
			const editor = page.getByTestId(`ChoiceEditor-${name}`);
			await editor.getByTestId('ChoiceEditor-open').click();
			await expect(editor.getByTestId('ChoiceEditor-default-mode')).toHaveValue(
				'same',
			);
			await editor
				.getByTestId('ChoiceEditor-default-mode')
				.selectOption('weekday');
			await expect(editor.getByTestId('ChoiceEditor-default')).toHaveCount(5);
		}
		const place = page.getByTestId('ChoiceEditor-place');
		await place
			.getByLabel('Default · Wed', { exact: true })
			.selectOption('home');
		await place
			.getByLabel('Default · Fri', { exact: true })
			.selectOption('home');
		await page
			.getByTestId('ChoiceEditor-outing')
			.getByLabel('Default · Fri', { exact: true })
			.selectOption('out');
		await page
			.getByTestId('ChoiceEditor-exercise')
			.getByLabel('Default · Wed', { exact: true })
			.selectOption('yes');
		await page.getByTestId('TemplateEditor-save').click();
		await expect(page.getByTestId('Templates-saved')).toBeVisible();
		const saved = (await (await request.get('/api/routine')).json()).routine
			.days.work.choices;
		expect(saved.place.default).toEqual({
			mon: 'office',
			tue: 'office',
			wed: 'home',
			thu: 'office',
			fri: 'home',
		});
		expect(saved.outing.default).toEqual({
			mon: 'staying',
			tue: 'staying',
			wed: 'staying',
			thu: 'staying',
			fri: 'out',
		});
		expect(saved.exercise.default).toEqual({
			mon: 'no',
			tue: 'no',
			wed: 'yes',
			thu: 'no',
			fri: 'no',
		});
		await page.reload();
		await page
			.getByTestId('Templates-row-work')
			.getByTestId('Templates-edit')
			.click();
		await page
			.getByTestId('ChoiceEditor-place')
			.getByTestId('ChoiceEditor-open')
			.click();
		await expect(
			page
				.getByTestId('ChoiceEditor-place')
				.getByTestId('ChoiceEditor-default-mode'),
		).toHaveValue('weekday');
		await expect(
			page
				.getByTestId('ChoiceEditor-place')
				.getByLabel('Default · Wed', { exact: true }),
		).toHaveValue('home');
		await page.getByTestId('TemplateEditor-cancel').click();
		await page.goto('/');
		await expect(page.getByTestId('Day-choice-place-home')).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await expect(page.getByTestId('Day-choice-exercise-yes')).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await page.getByTestId('Day-choice-place-office').click();
		await page.reload();
		await expect(page.getByTestId('Day-choice-place-office')).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await page.clock.setFixedTime(new Date('2026-11-20T12:00:00+01:00'));
		await page.reload();
		await expect(page.getByTestId('Day-choice-place-home')).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await expect(page.getByTestId('Day-choice-outing-out')).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await expect(page.getByTestId('Day-choice-exercise-no')).toHaveAttribute(
			'aria-checked',
			'true',
		);
	} finally {
		const current = await (await request.get('/api/routine')).json();
		expect(
			(
				await request.put('/api/routine', {
					headers: { 'If-Match': current.revision },
					data: { routine: original.routine },
				})
			).ok(),
		).toBeTruthy();
	}
});
test('Saturday offers named evening options in the daily view and editor', async ({
	page,
	request,
}) => {
	const original = await (await request.get('/api/routine')).json();
	try {
		const routine = {
			settings: { automatic_swedish_holidays: false },
			days: {
				saturday: {
					on: ['sat'],
					choices: {
						evening: {
							label: 'Evening',
							options: {
								stay_home: { label: 'Stay home' },
								going_out: { label: 'Going out' },
							},
							default: 'stay_home',
						},
					},
					items: [
						{ title: 'Dinner', time: '19:00', duration: 30 },
						{
							alternative: 'evening',
							paths: {
								going_out: [
									{ title: 'Get ready to go out', time: '18:30', duration: 30 },
								],
							},
						},
					],
				},
			},
		};
		expect(
			(
				await request.put('/api/routine', {
					headers: { 'If-Match': original.revision },
					data: { routine },
				})
			).ok(),
		).toBeTruthy();
		await page.clock.setFixedTime(new Date('2026-11-21T12:00:00+01:00'));
		await page.goto('/');
		const evening = page.getByRole('radiogroup', {
			name: 'Evening',
			exact: true,
		});
		await expect(
			evening.getByRole('radio', { name: 'Stay home', exact: true }),
		).toHaveAttribute('aria-checked', 'true');
		await expect(
			page.getByText('Get ready to go out', { exact: true }),
		).toHaveCount(0);
		await evening
			.getByRole('radio', { name: 'Going out', exact: true })
			.click();
		await expect(
			page.getByText('Get ready to go out', { exact: true }),
		).toBeVisible();
		await expect(page.getByText('Dinner', { exact: true })).toBeVisible();
		await page.reload();
		await expect(
			evening.getByRole('radio', { name: 'Going out', exact: true }),
		).toHaveAttribute('aria-checked', 'true');
		await page.goto('/templates');
		await page
			.getByTestId('Templates-row-saturday')
			.getByTestId('Templates-edit')
			.click();
		const editor = page.getByTestId('ChoiceEditor-evening');
		await editor.getByTestId('ChoiceEditor-open').click();
		await expect(editor.getByTestId('ChoiceEditor-type')).toHaveCount(0);
		expect(
			await editor
				.getByTestId('ChoiceEditor-option-name')
				.evaluateAll((inputs) =>
					inputs.map((input) => (input as HTMLInputElement).value),
				),
		).toEqual(['Stay home', 'Going out']);
		await editor.getByTestId('ChoiceEditor-default').selectOption('going_out');
		await page.getByTestId('TemplateEditor-save').click();
		await expect(page.getByTestId('Templates-saved')).toBeVisible();
		const saved = (await (await request.get('/api/routine')).json()).routine;
		expect(saved.days.saturday.choices.evening).not.toHaveProperty('type');
		expect(saved.days.saturday.choices.evening.default).toBe('going_out');
		expect(saved.days.saturday.items).toEqual(
			[...routine.days.saturday.items].reverse(),
		);
	} finally {
		const current = await (await request.get('/api/routine')).json();
		expect(
			(
				await request.put('/api/routine', {
					headers: { 'If-Match': current.revision },
					data: { routine: original.routine },
				})
			).ok(),
		).toBeTruthy();
	}
});
