import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
const testRoutine = JSON.parse(
  readFileSync(new URL("./fixtures/routine.json", import.meta.url), "utf8"),
);
test.beforeEach(async ({ request }) => {
  const current = await (await request.get("/api/routine")).json();
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine: testRoutine },
      })
    ).ok(),
  ).toBeTruthy();
});
/** Opens the app with the clock fixed at a local time in Stockholm. */
async function openAt(page: Page, isoLocal: string) {
  await page.clock.setFixedTime(new Date(`${isoLocal}+01:00`));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
test("shows activity notes without completion controls", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine = {
    days: {
      daily: {
        on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        items: [
          {
            title: "Morning",
            time: "08:00",
            note: "Water\nWash face",
            duration: 5,
          },
        ],
      },
    },
  };
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine },
      })
    ).ok(),
  ).toBeTruthy();
  await openAt(page, "2026-11-17T09:00:00");
  // Notes stay folded away until the row is tapped.
  await expect(page.getByTestId("Activity-note")).toHaveCount(0);
  await page.getByTestId("TimelineItem-toggle").click();
  await expect(page.getByTestId("Activity-note")).toHaveText(
    "Water\nWash face",
  );
  await expect(
    page.getByTestId("TimelineItem").getByRole("checkbox"),
  ).toHaveCount(0);
  await page.reload();
  await page.getByTestId("TimelineItem-toggle").click();
  await expect(page.getByTestId("Activity-note")).toHaveText(
    "Water\nWash face",
  );
  await page.getByTestId("Nav-templates").click();
  await page
    .getByTestId("Templates-row-daily")
    .getByTestId("Templates-open")
    .click();
  await page.getByTestId("TimelineItem-toggle").click();
  await expect(page.getByTestId("Activity-note")).toHaveText(
    "Water\nWash face",
  );
});
test("requires the server on first load and recovers with retry", async ({
  page,
}) => {
  await page.route("**/api/routine", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByTestId("Routine-unavailable")).toBeVisible();
  await expect(page.getByTestId("Day-empty")).toHaveCount(0);
  await expect(page.getByTestId("RoutineSync-toast")).toBeVisible();
  await page.unroute("**/api/routine");
  await page.getByTestId("RoutineSync-retry").click();
  await expect(page.getByTestId("Routine-unavailable")).toHaveCount(0);
  await expect(page.getByTestId("RoutineSync-toast")).toHaveCount(0);
  await expect(page.getByTestId("Nav-templates")).toBeVisible();
});
test("automatic holidays support quiet persistent overrides", async ({
  page,
}) => {
  await openAt(page, "2026-12-25T09:00:00");
  const holiday = page.getByTestId("Day-holiday-toggle");
  const source = page.getByTestId("Day-holiday-source");
  await expect(holiday).toBeChecked();
  await expect(source).toContainText("Juldagen");
  await holiday.uncheck();
  await page.reload();
  await expect(holiday).not.toBeChecked();
  await expect(source).toHaveCount(0);
  await page.getByTestId("Day-next").click();
  await expect(holiday).toBeChecked();
  await expect(source).toBeVisible();
  await page.getByTestId("Day-today").click();
  await expect(holiday).not.toBeChecked();
  await expect(source).toHaveCount(0);
  await holiday.check();
  await expect(source).toHaveCount(0);
  await page.reload();
  await expect(holiday).toBeChecked();
  await openAt(page, "2026-11-17T09:00:00");
  await expect(holiday).not.toBeChecked();
  await holiday.check();
  await page.reload();
  await expect(holiday).toBeChecked();
  await expect(source).toHaveCount(0);
});
test("opens Today at the top without scrolling to the current item", async ({
  page,
}) => {
  await openAt(page, "2026-11-17T21:02:00");
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
});

test("tapping today's date scrolls to the current activity on mobile and still returns from other days", async ({
  page,
}) => {
  await openAt(page, "2026-11-17T21:02:00");
  const current = page.locator("[data-current] .row").first();
  const todayButton = page.getByRole("button", {
    name: "Go to current activity",
    exact: true,
  });
  await expect(todayButton).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  async function currentIsVisible() {
    const row = (await current.boundingBox())!;
    const header = (await page.locator(".page-header").boundingBox())!;
    const nav = (await page
      .getByRole("navigation", { name: "Main navigation" })
      .boundingBox())!;
    return row.y >= header.y + header.height && row.y + row.height <= nav.y;
  }
  await todayButton.tap();
  await expect.poll(currentIsVisible).toBe(true);
  // It works again after scrolling away, without changing the selected day.
  await page.evaluate(() => window.scrollTo(0, 0));
  await todayButton.tap();
  await expect.poll(currentIsVisible).toBe(true);
  await page.getByTestId("Day-next").tap();
  await expect(page.locator("[data-current]")).toHaveCount(0);
  await page.getByTestId("Day-today").tap();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today");
  await expect.poll(currentIsVisible).toBe(true);
});
