import { test, expect, type Page } from "./test";

// The rest of the suite blocks service workers; these specs test the cached app they serve.
test.use({ serviceWorkers: "allow" });

/** Load the app and wait for the service worker to control the page. */
async function openApp(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener("controllerchange", r, {
          once: true,
        }),
      );
    }
  });
  await expect(page.getByTestId("Nav-templates")).toBeVisible();
}

test("launches from the cached app without the network", async ({
  page,
  context,
}) => {
  await openApp(page);

  await context.setOffline(true);
  await page.reload();

  // The app itself opens; the routine still needs the server.
  await expect(page.getByTestId("Routine-unavailable")).toBeVisible();
  await expect(page.getByTestId("RoutineSync-retry")).toBeVisible();
  // Reconnecting loads it.
  await context.setOffline(false);
  await expect(page.getByTestId("Nav-templates")).toBeVisible();
});

test("sign-in navigations skip the cached app and come back clean", async ({
  page,
}) => {
  await openApp(page);
  expect((await page.goto("/"))!.fromServiceWorker()).toBe(true);

  // "Sign in again" links here, so an expired Access session reaches its login page.
  expect((await page.goto("/?signin"))!.fromServiceWorker()).toBe(false);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("Nav-templates")).toBeVisible();
});
