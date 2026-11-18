import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Routine } from "../web/src/lib/routine/types.ts";
const empty = JSON.parse(
  readFileSync(new URL("../routine.default.json", import.meta.url), "utf8"),
);
let original: Routine;
test.beforeEach(async ({ request }) => {
  const current = await (await request.get("/api/routine")).json();
  original = current.routine;
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine: empty },
      })
    ).ok(),
  ).toBeTruthy();
});
test.afterEach(async ({ request }) => {
  const current = await (await request.get("/api/routine")).json();
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine: original },
      })
    ).ok(),
  ).toBeTruthy();
});
async function expandEntries(page: Page) {
  for (const entry of await page.getByTestId("EntryEditor-entry").all()) {
    if ((await entry.getAttribute("open")) === null)
      await entry.getByTestId("EntryEditor-open").first().click();
  }
}
test("starts empty, saves the first item, and can return to an empty template", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("Day-empty")).toBeVisible();
  await page.getByTestId("Day-create").click();
  await page
    .getByTestId("Templates-row-daily")
    .getByTestId("Templates-open")
    .click();
  await expect(page.getByTestId("Templates-empty")).toBeVisible();
  await expect(page.getByTestId("Templates-edit")).toHaveAccessibleName(
    "Edit Daily template",
  );
  await page.getByTestId("Templates-edit").click();
  await expect(page.getByTestId("TemplateEditor-name")).toHaveText("Daily");
  await page.getByTestId("EntryEditor-add").click();
  await expandEntries(page);
  await page.getByTestId("EntryEditor-title").fill("My first routine item");
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  await page.reload();
  await page.getByTestId("Templates-edit").click();
  await expect(page.getByTestId("EntryEditor-title")).toHaveValue(
    "My first routine item",
  );
  await expandEntries(page);
  await page.getByTestId("EntryEditor-remove").click();
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-empty")).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("Day-empty")).toBeVisible();
});
test("lists templates and offers creation only for unassigned days", async ({
  page,
}) => {
  // This test removes Tuesday's template and checks that day's empty state.
  await page.clock.setFixedTime(new Date("2026-11-17T12:00:00+01:00"));
  await page.goto("/templates");
  const daily = page.getByTestId("Templates-row-daily");
  await expect(daily.getByTestId("Templates-name")).toHaveText("Daily");
  await expect(page.getByTestId("Templates-new")).toHaveCount(0);
  await daily.getByTestId("Templates-edit").click();
  await page.getByTestId("TemplateEditor-day-sat").uncheck();
  await page.getByTestId("TemplateEditor-day-sun").uncheck();
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  await expect(daily.getByTestId("Templates-name")).toHaveText("Weekdays");
  await expect(page.getByTestId("Templates-unassigned")).toContainText(
    "Sat · Sun",
  );
  await page.getByTestId("Templates-new").click();
  await expect(page.getByTestId("TemplateEditor-new-mon")).toBeDisabled();
  await page.getByTestId("TemplateEditor-new-sat").check();
  await page.getByTestId("TemplateEditor-new-sun").check();
  await page.getByTestId("TemplateEditor-create-confirm").click();
  await page.getByTestId("EntryEditor-add").click();
  await expandEntries(page);
  await page.getByTestId("EntryEditor-title").fill("Weekend walk");
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  await expect(
    page.getByTestId("Templates-list").locator("article"),
  ).toHaveCount(2);
  await expect(page.getByTestId("Templates-new")).toHaveCount(0);
  await page.reload();
  const weekend = page.getByTestId("Templates-row-template");
  await expect(weekend.getByTestId("Templates-name")).toHaveText("Weekend");
  await weekend.getByTestId("Templates-edit").click();
  await expect(page.getByTestId("EntryEditor-title")).toHaveValue(
    "Weekend walk",
  );
  await expect(page.getByTestId("TemplateEditor-day-mon")).toBeDisabled();
  await page.getByTestId("TemplateEditor-cancel").click();
  await daily.getByTestId("Templates-edit").click();
  await page.getByTestId("TemplateEditor-day-tue").uncheck();
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-new")).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("Day-empty")).toContainText(
    "No template for this day",
  );
});
test("deletes the last template and creates a first template from an empty library", async ({
  page,
}) => {
  await page.goto("/templates");
  await page.getByTestId("Templates-edit").click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByTestId("TemplateEditor-delete").click();
  await expect(page.getByTestId("TemplateEditor")).toBeVisible();
  await page.route("**/api/routine", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Could not delete this template. Try again.",
        }),
      });
    else await route.continue();
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("TemplateEditor-delete").click();
  await expect(page.getByTestId("TemplateEditor-errors")).toBeVisible();
  await expect(page.getByTestId("TemplateEditor")).toBeVisible();
  await page.unroute("**/api/routine");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("TemplateEditor-delete").click();
  await expect(page.getByTestId("Templates-empty-library")).toBeVisible();
  await page.reload();
  await page.getByTestId("Templates-new").click();
  await page.getByTestId("TemplateEditor-new-mon").check();
  await page.getByTestId("TemplateEditor-create-confirm").click();
  await page.getByTestId("TemplateEditor-save").click();
  await expect(
    page.getByTestId("Templates-row-template").getByTestId("Templates-name"),
  ).toHaveText("Monday");
  await expect(page.getByTestId("Templates-new")).toBeVisible();
});
test("creates shared blocks even before the first template exists", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine: { days: {} } },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/templates");
  await page.getByTestId("Templates-blocks").click();
  await expect(page.getByTestId("TemplateEditor-delete")).toHaveCount(0);
  await page.getByTestId("TemplateEditor-block-new").click();
  await page.getByTestId("TemplateEditor-block-name").fill("Morning");
  await expandEntries(page);
  await page.getByTestId("EntryEditor-title").fill("Stretch");
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-empty-library")).toBeVisible();
  await page.reload();
  await page.getByTestId("Templates-blocks").click();
  await page.getByTestId("TemplateEditor-block-block").click();
  await expect(page.getByTestId("EntryEditor-title")).toHaveValue("Stretch");
});
test("creates a duration block and sets its start time only in the template", async ({
  page,
  request,
}) => {
  await page.goto("/templates");
  await page.getByTestId("Templates-blocks").click();
  await page.getByTestId("TemplateEditor-block-new").click();
  await page.getByTestId("TemplateEditor-block-name").fill("Morning");
  await expect(page.getByTestId("EntryEditor-time")).toHaveCount(0);
  await expect(page.getByTestId("EntryEditor-end")).toHaveCount(0);
  await expandEntries(page);
  await page.getByTestId("EntryEditor-title").fill("Stretch");
  await expandEntries(page);
  await page.getByTestId("EntryEditor-duration").fill("15");
  await page.getByTestId("EntryEditor-add").click();
  await expandEntries(page);
  await page.getByTestId("EntryEditor-title").nth(1).fill("Drink water");
  await expandEntries(page);
  await page.getByTestId("EntryEditor-duration").nth(1).fill("5");
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  await page
    .getByTestId("Templates-row-daily")
    .getByTestId("Templates-edit")
    .click();
  await page.getByTestId("EntryEditor-use").click();
  await expandEntries(page);
  await page.getByTestId("EntryEditor-time").fill("09:00");
  await page.getByTestId("TemplateEditor-save").click();
  const block = page
    .getByTestId("Templates-row-daily")
    .getByTestId("Timeline-block");
  await expect(block.getByTestId("Timeline-block-toggle")).toContainText(
    "09:00",
  );
  await block.getByTestId("Timeline-block-toggle").click();
  await expect(block.getByTestId("Timeline-block-duration")).toHaveText([
    "15 min",
    "5 min",
  ]);
  await page.reload();
  await expect(block.getByTestId("Timeline-block-toggle")).toContainText(
    "09:00",
  );
  const saved = (await (await request.get("/api/routine")).json()).routine;
  expect(saved.blocks.block.items).toEqual([
    { title: "Stretch", duration: 15 },
    { title: "Drink water", duration: 5 },
  ]);
  expect(saved.days.daily.items[0]).toMatchObject({
    use: "block",
    time: "09:00",
  });
  await page.goto("/");
  const dailyBlock = page.getByTestId("Timeline-block");
  await expect(dailyBlock.getByTestId("Timeline-block-toggle")).toContainText(
    "09:00",
  );
  await dailyBlock.getByTestId("Timeline-block-toggle").click();
  await expect(dailyBlock.getByTestId("Timeline-block-duration")).toHaveText([
    "15 min",
    "5 min",
  ]);
});
