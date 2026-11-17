/** Retire the offline cache and unregister; all requests use the network. */
import { self } from '$app/service-worker';

self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith('dayspec-')) await caches.delete(key);
			}
			await self.registration.unregister();
		})()
	);
});
