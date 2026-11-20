import { expect, test, type Page } from "@playwright/test";

// The app only adds its own pull-to-refresh in the home-screen app, so pretend to be one.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { value: true }),
  );
});

/** Drag a finger down from near the top of the page by `distance` px and let go. */
async function pull(page: Page, distance: number) {
  await page.evaluate((distance) => {
    const fire = (type: string, y: number) => {
      // WebKit doesn't expose a constructible Touch; both engines accept this synthetic event payload.
      const touch = {
        identifier: 1,
        target: document.body,
        clientX: 180,
        clientY: y,
      };
      const event = Object.assign(
        new Event(type, { bubbles: true, cancelable: true }),
        {
          touches: type === "touchend" ? [] : [touch],
          changedTouches: [touch],
        },
      );
      document.body.dispatchEvent(event);
    };
    fire("touchstart", 100);
    for (let y = 110; y <= 100 + distance; y += 10) fire("touchmove", y);
    // Release after the gesture has been dispatched.
    setTimeout(() => fire("touchend", 100 + distance));
  }, distance);
}

/** Marks the current page so a reload can be told apart from staying put. */
async function mark(page: Page) {
  await page.evaluate(() => (document.body.dataset.marked = "yes"));
}

const marked = (page: Page) =>
  page.evaluate(() => document.body.dataset.marked ?? null);

test("pulling refreshes in place and keeps the selected day", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByTestId("Day-next").click();
  const heading = await page.getByRole("heading", { level: 1 }).textContent();
  await mark(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/routine", async (route) => {
    await gate;
    await route.continue();
  });
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith("/api/routine"),
  );
  await pull(page, 220);
  await expect(page.getByTestId("pull-to-refresh")).toHaveClass(/refreshing/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading!);
  await expect(page.getByText("Loading routine…")).toHaveCount(0);
  expect(await marked(page)).toBe("yes");
  release();
  await refreshed;
  await expect(page.getByTestId("pull-to-refresh")).toHaveCSS("opacity", "0");
  expect(await marked(page)).toBe("yes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading!);
});

test("a short pull springs back without reloading", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await mark(page);

  await pull(page, 60);
  await expect(page.getByTestId("pull-to-refresh")).toHaveCSS("opacity", "0");
  expect(await marked(page)).toBe("yes");
});

test("an open template editor never reloads, so its draft survives", async ({
  page,
}) => {
  await page.goto("/templates");
  await page.getByTestId("Templates-edit").first().click();
  await expect(page.getByTestId("TemplateEditor")).toBeVisible();
  await mark(page);

  await pull(page, 220);
  await page.waitForTimeout(300);
  expect(await marked(page)).toBe("yes");
  await expect(page.getByTestId("pull-to-refresh")).toHaveCSS("opacity", "0");
});

test("a failed pull keeps content visible and offers retry", async ({
  page,
}) => {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await page.route("**/api/routine", (route) => route.abort());
  await mark(page);
  await pull(page, 220);
  await expect(page.getByTestId("RoutineSync-toast")).toBeVisible();
  await expect(page.getByTestId("pull-to-refresh")).toHaveCSS("opacity", "0");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  expect(await marked(page)).toBe("yes");
});
