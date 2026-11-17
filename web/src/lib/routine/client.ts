import schema from '../../../../routine.schema.json';
import { get, writable } from 'svelte/store';
import type { Routine } from './types.ts';
import { validateRoutine } from './validate.ts';

export interface Snapshot {
	routine: Routine;
	revision: string;
}
interface State extends Snapshot {
	loading: boolean;
	refreshing: boolean;
	online: boolean;
	message: string;
}
const UNAVAILABLE = 'Could not refresh your routine. Check your connection and retry.';

export const routineState = writable<State>({
	routine: { days: {} },
	revision: '',
	loading: true,
	refreshing: false,
	online: false,
	message: ''
});

let generation = 0;
let writes = 0;
let pending: { controller: AbortController; promise: Promise<void> } | null = null;

function remember(snapshot: Snapshot) {
	routineState.update((state) => ({
		...snapshot,
		// An unchanged routine needn't re-resolve the visible timeline.
		routine: state.revision === snapshot.revision ? state.routine : snapshot.routine,
		loading: false,
		refreshing: false,
		online: true,
		message: ''
	}));
}

async function read(response: Response): Promise<Snapshot> {
	if (!response.headers.get('content-type')?.includes('application/json')) {
		throw new Error('Could not reach Dayspec. Check your connection or sign in again, then retry.');
	}
	const body = await response.json();
	if (!response.ok) throw new Error(body.error || 'Could not save templates. Try again.');
	if (typeof body.revision !== 'string' || validateRoutine(body.routine, schema).length) {
		throw new Error('The server returned invalid templates. Your current routine has been kept.');
	}
	return body as Snapshot;
}

function cancelRefresh() {
	generation++;
	pending?.controller.abort();
	pending = null;
	routineState.update((state) => ({ ...state, refreshing: false }));
}

async function fetchRoutine(token: number, signal: AbortSignal): Promise<void> {
	try {
		const snapshot = await read(await fetch('/api/routine', { cache: 'no-store', signal }));
		if (token === generation) remember(snapshot);
	} catch {
		if (token === generation) {
			routineState.update((state) => ({
				...state,
				loading: false,
				refreshing: false,
				online: false,
				message: UNAVAILABLE
			}));
		}
	}
}

/** Refresh in the background, sharing a request when focus/visibility/online fire together. */
export function loadRoutine(): Promise<void> {
	if (writes) return Promise.resolve();
	if (pending) return pending.promise;
	const controller = new AbortController();
	routineState.update((state) => ({ ...state, refreshing: true }));
	const promise = fetchRoutine(generation, AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]));
	pending = { controller, promise };
	void promise.finally(() => {
		if (pending?.promise === promise) pending = null;
	});
	return promise;
}

function offline() {
	cancelRefresh();
	routineState.update((state) => ({ ...state, loading: false, online: false, message: UNAVAILABLE }));
}

/** Refresh on launch, returning to the app and reconnecting; never unmount an open editor. */
export function startRoutineRefresh(): () => void {
	const visible = () => {
		if (document.visibilityState === 'visible') void loadRoutine();
	};
	const online = () => {
		void loadRoutine();
	};
	window.addEventListener('focus', visible);
	document.addEventListener('visibilitychange', visible);
	window.addEventListener('online', online);
	window.addEventListener('offline', offline);
	if (navigator.onLine === false) offline();
	else void loadRoutine();
	return () => {
		window.removeEventListener('focus', visible);
		document.removeEventListener('visibilitychange', visible);
		window.removeEventListener('online', online);
		window.removeEventListener('offline', offline);
		cancelRefresh();
	};
}

export async function saveRoutine(routine: Routine, revision: string): Promise<void> {
	writes++;
	// A GET started before a save must never replace the newly saved routine.
	cancelRefresh();
	try {
		const snapshot = await read(
			await fetch('/api/routine', {
				method: 'PUT',
				signal: AbortSignal.timeout(15_000),
				headers: { 'Content-Type': 'application/json', 'If-Match': revision },
				body: JSON.stringify({ routine })
			})
		);
		remember(snapshot);
	} finally {
		writes--;
	}
}

export function currentRoutine(): Snapshot {
	const { routine, revision } = get(routineState);
	return { routine, revision };
}
