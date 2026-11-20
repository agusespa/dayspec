import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { Routine } from './types.ts';
const routine: Routine = {
	templates: {
		saturday: {
			on: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
			items: [{ time: '08:00', title: 'Wake', duration: 5 }]
		}
	}
};
const snapshot = { routine, revision: '"one"' };
const storage = { getItem: vi.fn(), setItem: vi.fn() };
const fetcher = vi.fn();
beforeEach(() => {
	vi.resetModules();
	storage.getItem.mockReset().mockReturnValue(null);
	storage.setItem.mockReset();
	fetcher.mockReset();
	vi.stubGlobal('localStorage', storage);
	vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('routine loading and saving', () => {
	it('loads templates from the server without browser caching', async () => {
		fetcher.mockResolvedValue(json(snapshot));
		const client = await import('./client.ts');
		await client.loadRoutine();
		expect(get(client.routineState)).toMatchObject({ ...snapshot, online: true, loading: false });
		expect(storage.getItem).not.toHaveBeenCalled();
		expect(storage.setItem).not.toHaveBeenCalled();
	});
	it('orders saved block occurrences on load and after saves, keeping the server revision', async () => {
		const unsorted: Routine = {
			templates: {
				day: {
					on: ['mon'],
					items: [
						{ title: 'Dinner', time: '19:00', duration: 30 },
						{ use: 'wake', time: '07:00' }
					]
				}
			},
			blocks: { wake: { name: 'Wake', items: [{ title: 'Water', duration: 5 }] } }
		};
		fetcher.mockResolvedValueOnce(json({ routine: unsorted, revision: '"one"' }));
		const client = await import('./client.ts');
		await client.loadRoutine();
		expect(client.currentRoutine().routine.templates.day.items).toEqual(
			[...unsorted.templates.day.items].reverse()
		);
		expect(client.currentRoutine().revision).toBe('"one"');
		fetcher.mockResolvedValueOnce(json({ routine: unsorted, revision: '"two"' }));
		await client.saveRoutine(unsorted, '"one"');
		expect(client.currentRoutine().routine.templates.day.items[0]).toEqual({ use: 'wake', time: '07:00' });
		expect(client.currentRoutine().revision).toBe('"two"');
	});
	it('does not show a cached or bundled routine when the first request fails', async () => {
		storage.getItem.mockReturnValue(JSON.stringify(routine));
		fetcher.mockRejectedValue(new TypeError('Offline'));
		const client = await import('./client.ts');
		await client.loadRoutine();
		expect(get(client.routineState)).toMatchObject({
			routine: { templates: {} },
			revision: '',
			online: false,
			loading: false,
			message: expect.any(String)
		});
	});
	it('only changes the active routine after a successful save, sending the draft revision', async () => {
		fetcher.mockResolvedValueOnce(json(snapshot));
		const client = await import('./client.ts');
		await client.loadRoutine();
		const edited = structuredClone(routine);
		edited.templates.saturday.theme = 'Updated';
		fetcher.mockResolvedValueOnce(json({ routine: edited, revision: '"two"' }));
		await client.saveRoutine(edited, snapshot.revision);
		expect(fetcher).toHaveBeenLastCalledWith(
			'/api/routine',
			expect.objectContaining({
				method: 'PUT',
				headers: { 'Content-Type': 'application/json', 'If-Match': snapshot.revision },
				body: JSON.stringify({ routine: edited })
			})
		);
		expect(get(client.routineState).routine).toEqual(edited);
	});
	it('keeps active templates on conflicts, failed requests and login redirects', async () => {
		const client = await import('./client.ts');
		fetcher.mockResolvedValueOnce(json(snapshot));
		await client.loadRoutine();
		for (const response of [
			json({ error: 'Reload before saving' }, 412),
			new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }),
			json({ routine: {}, revision: '"bad"' })
		]) {
			fetcher.mockResolvedValueOnce(response);
			await expect(client.saveRoutine(routine, snapshot.revision)).rejects.toThrow();
			expect(client.currentRoutine()).toEqual(snapshot);
		}
	});
});
describe('automatic routine refresh', () => {
	it('keeps the displayed routine when a background refresh fails', async () => {
		const client = await import('./client.ts');
		fetcher.mockResolvedValueOnce(json(snapshot));
		await client.loadRoutine();
		fetcher.mockRejectedValueOnce(new TypeError('Offline'));
		await client.loadRoutine();
		expect(get(client.routineState)).toMatchObject({ ...snapshot, online: false, refreshing: false });
	});
	it('coalesces simultaneous refreshes and keeps unchanged routine references', async () => {
		let resolve!: (response: Response) => void;
		fetcher.mockReturnValueOnce(
			new Promise<Response>((done) => {
				resolve = done;
			})
		);
		const client = await import('./client.ts');
		const first = client.loadRoutine();
		expect(client.loadRoutine()).toBe(first);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(get(client.routineState).refreshing).toBe(true);
		resolve(json(snapshot));
		await first;
		const previous = get(client.routineState).routine;
		fetcher.mockResolvedValueOnce(json(snapshot));
		await client.loadRoutine();
		expect(get(client.routineState).routine).toBe(previous);
	});
	it('does not let an older GET replace a successfully saved routine', async () => {
		let resolve!: (response: Response) => void;
		fetcher.mockReturnValueOnce(
			new Promise<Response>((done) => {
				resolve = done;
			})
		);
		const client = await import('./client.ts');
		const oldRead = client.loadRoutine();
		const edited = structuredClone(routine);
		edited.templates.saturday.theme = 'Saved on this device';
		fetcher.mockResolvedValueOnce(json({ routine: edited, revision: '"two"' }));
		await client.saveRoutine(edited, snapshot.revision);
		resolve(json(snapshot));
		await oldRead;
		expect(client.currentRoutine()).toEqual({ routine: edited, revision: '"two"' });
		expect(get(client.routineState).online).toBe(true);
	});
	it('does not start a background read during a save', async () => {
		const client = await import('./client.ts');
		let resolve!: (response: Response) => void;
		fetcher.mockReturnValueOnce(
			new Promise<Response>((done) => {
				resolve = done;
			})
		);
		const save = client.saveRoutine(routine, snapshot.revision);
		await client.loadRoutine();
		expect(fetcher).toHaveBeenCalledTimes(1);
		resolve(json(snapshot));
		await save;
	});
	it('refreshes on launch, visible focus and reconnection, and removes its listeners on cleanup', async () => {
		const win = new EventTarget();
		const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
		vi.stubGlobal('window', win);
		vi.stubGlobal('document', doc);
		vi.stubGlobal('navigator', { onLine: true });
		fetcher.mockImplementation(async () => json(snapshot));
		const client = await import('./client.ts');
		const stop = client.startRoutineRefresh();
		await client.loadRoutine();
		expect(fetcher).toHaveBeenCalledTimes(1);
		doc.visibilityState = 'hidden';
		doc.dispatchEvent(new Event('visibilitychange'));
		win.dispatchEvent(new Event('focus'));
		expect(fetcher).toHaveBeenCalledTimes(1);
		doc.visibilityState = 'visible';
		doc.dispatchEvent(new Event('visibilitychange'));
		win.dispatchEvent(new Event('focus'));
		await client.loadRoutine();
		expect(fetcher).toHaveBeenCalledTimes(2);
		win.dispatchEvent(new Event('offline'));
		expect(get(client.routineState).online).toBe(false);
		win.dispatchEvent(new Event('online'));
		await client.loadRoutine();
		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(get(client.routineState).online).toBe(true);
		stop();
		win.dispatchEvent(new Event('focus'));
		win.dispatchEvent(new Event('online'));
		doc.dispatchEvent(new Event('visibilitychange'));
		expect(fetcher).toHaveBeenCalledTimes(3);
	});
	it('reports unavailable without reading cached data when starting offline', async () => {
		vi.stubGlobal('window', new EventTarget());
		vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
		vi.stubGlobal('navigator', { onLine: false });
		storage.getItem.mockReturnValue(JSON.stringify(routine));
		const client = await import('./client.ts');
		const stop = client.startRoutineRefresh();
		expect(fetcher).not.toHaveBeenCalled();
		expect(get(client.routineState)).toMatchObject({
			routine: { templates: {} },
			revision: '',
			loading: false,
			online: false
		});
		stop();
	});
});
