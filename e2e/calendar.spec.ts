import { expect, test } from '@playwright/test';

test('adds activities and shared blocks to Calendar from their details', async ({
	page,
	request,
	context,
}) => {
	const original = await (await request.get('/api/routine')).json();
	try {
		const routine = {
			settings: { automatic_swedish_holidays: false },
			blocks: {
				morning: {
					name: 'Morning',
					items: [
						{
							title: 'Breakfast',
							duration: 15,
							note: 'Coffee',
							link: 'https://example.com/recipe',
						},
						{ title: 'Get ready', duration: 10 },
					],
				},
			},
			templates: {
				daily: {
					on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
					items: [
						{ use: 'morning', time: '07:00' },
						{ title: 'Work', time: '09:00', duration: 60 },
						{ time: '10:00', title: 'Break', duration: 5 },
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
		await page.clock.setFixedTime(new Date('2026-11-18T12:00:00+01:00'));
		await page.goto('/');
		const block = page.getByTestId('Timeline-block');
		const link = page.getByRole('link', {
			name: 'Add Morning to Google Calendar',
			exact: true,
		});
		// Calendar links stay folded away until the block or row is opened.
		await expect(link).toHaveCount(0);
		await block.getByTestId('Timeline-block-toggle').click();
		await expect(link).toBeVisible();
		const url = new URL((await link.getAttribute('href'))!);
		expect(url.searchParams.get('text')).toBe('Morning');
		expect(url.searchParams.get('dates')).toBe(
			'20261118T070000/20261118T072500',
		);
		expect(url.searchParams.get('ctz')).toBe('Europe/Stockholm');
		expect(url.searchParams.get('details')).toContain(
			'Coffee\nhttps://example.com/recipe',
		);
		await context.route('https://calendar.google.com/**', (route) =>
			route.fulfill({
				contentType: 'text/html',
				body: '<p>Calendar draft</p>',
			}),
		);
		const popup = page.waitForEvent('popup');
		await link.click();
		await (await popup).close();
		await block.getByTestId('Timeline-block-entry-toggle').first().click();
		await expect(
			page.getByRole('link', {
				name: 'Add Breakfast to Google Calendar',
				exact: true,
			}),
		).toBeVisible();
		// Every template activity has a start time and can create a calendar draft.
		const unscheduled = page
			.getByTestId('TimelineItem')
			.filter({ hasText: 'Break' });
		await unscheduled.getByTestId('TimelineItem-toggle').click();
		await expect(unscheduled.getByTestId('ItemDetails-duration')).toHaveText(
			'5 min',
		);
		await expect(
			unscheduled.getByRole('link', { name: /to Google Calendar/ }),
		).toBeVisible();
		await page.getByRole('button', { name: 'Next day', exact: true }).click();
		await page
			.getByTestId('TimelineItem')
			.filter({ hasText: 'Work' })
			.getByTestId('TimelineItem-toggle')
			.click();
		const work = page.getByRole('link', {
			name: 'Add Work to Google Calendar',
			exact: true,
		});
		expect(
			new URL((await work.getAttribute('href'))!).searchParams.get('dates'),
		).toBe('20261119T090000/20261119T100000');
		await page.goto('/profile');
		await expect(page.getByTestId('Profile-calendar')).toHaveValue('google');
		await expect(
			page.getByTestId('Profile-calendar').locator('option'),
		).toHaveCount(1);
		const saved = page.waitForResponse(
			(r) => r.url().endsWith('/api/routine') && r.request().method() === 'PUT',
		);
		await page.getByTestId('Profile-calendar').selectOption('google');
		expect((await saved).ok()).toBeTruthy();
		await page.reload();
		await expect(page.getByTestId('Profile-calendar')).toHaveValue('google');
		expect(
			(await (await request.get('/api/routine')).json()).routine.settings
				.calendar,
		).toBe('google');
		await page.goto('/templates');
		await page
			.getByTestId('Templates-row-daily')
			.getByTestId('Templates-open')
			.click();
		await expect(
			page.getByRole('link', { name: /to Google Calendar/ }),
		).toHaveCount(0);
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
