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
      const touch = new Touch({
        identifier: 1,
        target: document.body,
        clientX: 180,
        clientY: y,
      });
      document.body.dispatchEvent(
        new TouchEvent(type, {
          touches: type === "touchend" ? [] : [touch],
          changedTouches: [touch],
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    fire("touchstart", 100);
    for (let y = 110; y <= 100 + distance; y += 10) fire("touchmove", y);
    // Released after evaluate returns, since letting go may reload the page.
    setTimeout(() => fire("touchend", 100 + distance));
  }, distance);
}

/** Marks the current page so a reload can be told apart from staying put. */
async function mark(page: Page) {
  await page.evaluate(() => (document.body.dataset.marked = "yes"));
}

const marked = (page: Page) =>
  page.evaluate(() => document.body.dataset.marked ?? null);

test("pulling down far enough reloads the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await mark(page);

  await Promise.all([page.waitForEvent("load"), pull(page, 220)]);
  expect(await marked(page)).toBeNull();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
