import { expect, test } from "@playwright/test";
import routine from "./fixtures/routine.json" with { type: "json" };

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

for (const width of [1024, 1440]) {
  test(`desktop library and template editor use the available width at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/routine", (route) =>
      route.fulfill({ json: { routine, revision: '"desktop"' } }),
    );
    await page.goto("/templates");
    const cards = page.locator(".template-card");
    await expect(cards.first()).toBeVisible();
    const first = (await cards.nth(0).boundingBox())!;
    const second = (await cards.nth(1).boundingBox())!;
    expect(first.y).toBe(second.y);
    expect(second.x).toBeGreaterThan(first.x + first.width);
    await cards.first().getByTestId("Templates-edit").click();
    const settings = (await page
      .getByTestId("TemplateEditor-theme")
      .boundingBox())!;
    const timeline = (await page.locator(".editor-timeline").boundingBox())!;
    expect(timeline.x).toBeGreaterThan(settings.x + settings.width);
    expect(timeline.width).toBeGreaterThan(settings.width);
    await page.getByTestId("ChoiceEditor-open").first().click();
    await page.getByTestId("EntryEditor-open").first().click();
    await page.getByTestId("TemplateEditor-theme").fill("Desktop editing");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByTestId("TemplateEditor-save")).toBeInViewport();
    await expect(page.getByTestId("TemplateEditor-cancel")).toBeInViewport();
    const response = page.waitForRequest(
      (request) => request.method() === "PUT",
    );
    await page.getByTestId("TemplateEditor-save").click();
    expect((await response).postDataJSON().routine.days.weekday.theme).toBe(
      "Desktop editing",
    );
    await expect(page.getByTestId("Templates-saved")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
}

test("desktop shared block editing places activities beside its settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/routine", (route) =>
    route.fulfill({ json: { routine, revision: '"desktop"' } }),
  );
  await page.goto("/templates");
  await page.getByTestId("Templates-blocks").click();
  await page.getByTestId("TemplateEditor-block-wake_up").click();
  const name = (await page
    .getByTestId("TemplateEditor-block-name")
    .boundingBox())!;
  const activities = (await page.locator(".editor-timeline").boundingBox())!;
  expect(activities.x).toBeGreaterThan(name.x + name.width);
  await page.getByTestId("EntryEditor-open").first().click();
  await expect(page.getByTestId("EntryEditor-title").first()).toBeVisible();
  await page.getByTestId("TemplateEditor-cancel").click();
  await expect(page.getByTestId("Templates-list")).toBeVisible();
});

test("below the desktop breakpoint the library and editor retain their single column and bottom save bar", async ({
  page,
}) => {
  await page.route("**/api/routine", (route) =>
    route.fulfill({ json: { routine, revision: '"mobile"' } }),
  );
  for (const width of [390, 768, 1023]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/templates");
    const cards = page.locator(".template-card");
    await expect(cards.first()).toBeVisible();
    const first = (await cards.nth(0).boundingBox())!;
    const second = (await cards.nth(1).boundingBox())!;
    expect(first.x).toBe(second.x);
    expect(second.y).toBeGreaterThan(first.y + first.height);
    await cards.first().getByTestId("Templates-edit").click();
    const theme = (await page
      .getByTestId("TemplateEditor-theme")
      .boundingBox())!;
    const timeline = (await page.locator(".timeline-heading").boundingBox())!;
    expect(timeline.x).toBe(theme.x);
    expect(timeline.y).toBeGreaterThan(theme.y + theme.height);
    const save = (await page.getByTestId("TemplateEditor-save").boundingBox())!;
    expect(save.y).toBeGreaterThan(800);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
});

test("desktop navigation floats above the bottom and keeps its size when switching pages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/routine", (route) =>
    route.fulfill({ json: { routine, revision: '"navigation"' } }),
  );
  await page.goto("/profile");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toBeVisible();
  const initial = (await nav.boundingBox())!;
  expect(900 - initial.y - initial.height).toBe(24);
  const templates = page.getByTestId("Nav-templates");
  const icon = (await templates.locator("svg").boundingBox())!;
  const label = (await templates.locator("span").boundingBox())!;
  expect(label.x).toBeGreaterThan(icon.x + icon.width);
  expect(
    Math.abs(label.y + label.height / 2 - icon.y - icon.height / 2),
  ).toBeLessThan(1);
  await templates.click();
  await expect(templates).toHaveAttribute("aria-current", "page");
  await page.getByTestId("Nav-daily").click();
  await expect(
    page.getByRole("button", { name: "Previous day" }),
  ).toBeVisible();
  await page.getByTestId("Day-next").click();
  await expect(page.getByTestId("Day-today")).toBeVisible();
  await page.getByTestId("Day-today").click();
  await expect(page.getByTestId("Day-today")).toHaveCount(0);
  const daily = (await nav.boundingBox())!;
  expect(daily).toEqual(initial);
  await page.getByTestId("Nav-profile").click();
  await expect(page.getByTestId("Nav-profile")).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await nav.boundingBox()).toEqual(initial);
});

test("desktop Daily button returns to today and reveals the current activity below the sticky header", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date("2026-11-17T21:02:00+01:00"));
  await page.route("**/api/routine", (route) =>
    route.fulfill({ json: { routine, revision: '"today"' } }),
  );
  await page.goto("/");
  const currentRow = page.locator("[data-current] .row").first();
  await expect(page.getByTestId("Day-current")).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.getByTestId("Day-current").click();
  async function currentIsVisible() {
    const row = (await currentRow.boundingBox())!;
    const header = (await page.locator(".page-header").boundingBox())!;
    const nav = (await page
      .getByRole("navigation", { name: "Main navigation" })
      .boundingBox())!;
    return row.y >= header.y + header.height && row.y + row.height <= nav.y;
  }
  await expect.poll(currentIsVisible).toBe(true);
  // A row hidden behind the fixed header must count as outside the visible content.
  await currentRow.evaluate((el) =>
    window.scrollTo(0, scrollY + el.getBoundingClientRect().top - 40),
  );
  await page.getByTestId("Day-current").click();
  await expect.poll(currentIsVisible).toBe(true);
  await page.getByTestId("Day-next").click();
  await expect(page.locator("[data-current]")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("Day-today").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today");
  await expect.poll(currentIsVisible).toBe(true);
});
