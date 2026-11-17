import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Routine } from "../web/src/lib/routine/types.ts";
const testRoutine = JSON.parse(
  readFileSync(new URL("./fixtures/routine.json", import.meta.url), "utf8"),
);
let original: Routine;
test.beforeEach(async ({ request }) => {
  const current = await (await request.get("/api/routine")).json();
  original = current.routine;
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine: testRoutine },
      })
    ).ok(),
  ).toBeTruthy();
});
test.afterEach(async ({ request }) => {
  const current = await (await request.get("/api/routine")).json();
  if (JSON.stringify(current.routine) !== JSON.stringify(original)) {
    const response = await request.put("/api/routine", {
      headers: { "If-Match": current.revision },
      data: { routine: original },
    });
    expect(response.ok()).toBeTruthy();
  }
});
async function expandEntries(page: Page) {
  for (const entry of await page.getByTestId("EntryEditor-entry").all()) {
    if ((await entry.getAttribute("open")) === null)
      await entry.getByTestId("EntryEditor-open").first().click();
  }
}
async function openEditor(page: Page) {
  await page.goto("/templates?t=saturday");
  await expect(
    page.getByTestId("Templates-row-saturday").getByTestId("Templates-edit"),
  ).toBeEnabled();
  await page
    .getByTestId("Templates-row-saturday")
    .getByTestId("Templates-edit")
    .click();
  await expect(page.getByTestId("TemplateEditor")).toBeVisible();
}
async function save(page: Page) {
  const response = page.waitForResponse(
    (res) =>
      res.url().endsWith("/api/routine") && res.request().method() === "PUT",
  );
  await page.getByTestId("TemplateEditor-save").click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
}
test("saves template edits across reloads and devices", async ({
  page,
  browser,
  request,
}) => {
  await openEditor(page);
  await page.getByTestId("TemplateEditor-theme").fill("A quieter Saturday");
  const index = original.days.saturday.items.findIndex(
    (entry) => "title" in entry,
  );
  const entry = page
    .getByTestId("TemplateEditor")
    .getByTestId("EntryEditor-entry")
    .nth(index);
  await entry.getByTestId("EntryEditor-open").first().click();
  await entry
    .getByTestId("EntryEditor-title")
    .first()
    .fill("A new Saturday activity");
  await save(page);
  await page.reload();
  await expect(page.getByText("A quieter Saturday")).toBeVisible();
  await expect(page.getByText("A new Saturday activity")).toBeVisible();
  const persisted = await (await request.get("/api/routine")).json();
  expect(persisted.routine.blocks).toEqual(original.blocks);
  expect(persisted.routine.days.saturday.choices).toEqual(
    original.days.saturday.choices,
  );
  const other = await browser.newContext();
  try {
    const device = await other.newPage();
    await device.goto("/templates?t=saturday");
    await expect(device.getByText("A quieter Saturday")).toBeVisible();
  } finally {
    await other.close();
  }
});
test("edits a shared block and keeps the change when returning to the template", async ({
  page,
  request,
}) => {
  await page.goto("/templates?t=saturday");
  await page.getByTestId("Templates-blocks").click();
  await page.getByTestId("TemplateEditor-block-wake_up").click();
  await expect(page.getByTestId("EntryEditor-title")).toBeHidden();
  await expandEntries(page);
  await page.getByTestId("EntryEditor-title").fill("Wake refreshed");
  await save(page);
  const persisted = await (await request.get("/api/routine")).json();
  expect(persisted.routine.blocks.wake_up.items[0].title).toBe(
    "Wake refreshed",
  );
  await page.reload();
  await page.getByTestId("Timeline-block-toggle").first().click();
  await expect(page.getByTestId("Timeline-block-entry").first()).toContainText(
    "Wake refreshed",
  );
});
test("edits only the selected template without editor navigation or JSON controls", async ({
  page,
  request,
}) => {
  await openEditor(page);
  await expect(page.getByTestId("TemplateEditor-name")).toHaveText("Saturday");
  for (const id of [
    "TemplateEditor-template",
    "TemplateEditor-blocks",
    "TemplateEditor-advanced",
    "TemplateEditor-json",
  ]) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  await page.getByTestId("TemplateEditor-theme").fill("Focused Saturday");
  await save(page);
  const saved = (await (await request.get("/api/routine")).json()).routine;
  expect(saved).toEqual({
    ...testRoutine,
    days: {
      ...testRoutine.days,
      saturday: { ...testRoutine.days.saturday, theme: "Focused Saturday" },
    },
  });
});
test("a stale save preserves the draft and cannot overwrite another device’s edits", async ({
  page,
  request,
}) => {
  await openEditor(page);
  await page.getByTestId("TemplateEditor-theme").fill("My unsaved draft");
  const latest = await (await request.get("/api/routine")).json();
  latest.routine.days.saturday.theme = "Changed on another device";
  const update = await request.put("/api/routine", {
    headers: { "If-Match": latest.revision },
    data: { routine: latest.routine },
  });
  expect(update.ok()).toBeTruthy();
  const response = page.waitForResponse(
    (res) => res.request().method() === "PUT",
  );
  await page.getByTestId("TemplateEditor-save").click();
  expect((await response).status()).toBe(412);
  await expect(page.getByTestId("TemplateEditor-errors")).toBeVisible();
  await expect(page.getByTestId("TemplateEditor-theme")).toHaveValue(
    "My unsaved draft",
  );
  expect(
    (await (await request.get("/api/routine")).json()).routine.days.saturday
      .theme,
  ).toBe("Changed on another device");
});
test("cancel protection leaves the saved routine unchanged", async ({
  page,
  request,
}) => {
  await openEditor(page);
  await page.getByTestId("TemplateEditor-theme").fill("Discard this");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByTestId("TemplateEditor-cancel").click();
  await expect(page.getByTestId("TemplateEditor")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("TemplateEditor-cancel").click();
  await expect(page.getByTestId("TemplateEditor")).toHaveCount(0);
  expect((await (await request.get("/api/routine")).json()).routine).toEqual(
    original,
  );
});
test("edits activity notes and reorders entries without losing details", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine = {
    days: {
      saturday: {
        on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        items: [
          { title: "First", note: "Water", duration: 5 },
          { title: "Second", duration: 5 },
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
  await openEditor(page);
  await expect(page.getByTestId("EntryEditor-note").first()).toBeHidden();
  await expandEntries(page);
  await page.getByTestId("EntryEditor-note").first().fill("Water\nWash face");
  await expandEntries(page);
  await page
    .getByTestId("EntryEditor-entry")
    .last()
    .getByTestId("EntryEditor-up")
    .click();
  await save(page);
  const persisted = (await (await request.get("/api/routine")).json()).routine;
  expect(persisted.days.saturday.items).toEqual([
    { title: "Second", duration: 5 },
    { title: "First", note: "Water\nWash face", duration: 5 },
  ]);
  await page.reload();
  await expect(page.getByTestId("Activity-note")).toHaveText(
    "Water\nWash face",
  );
});
test("reports a connection failure and refreshes on reconnect", async ({
  page,
  context,
  request,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-17T10:00:00Z"));
  await page.goto("/templates?t=saturday");
  await expect(
    page.getByTestId("Templates-row-saturday").getByTestId("Templates-edit"),
  ).toBeEnabled();
  await expect(page.getByTestId("RoutineSync")).toHaveCount(0);
  await expect(page.getByTestId("RoutineSync-toast")).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByTestId("RoutineSync-toast")).toBeVisible();
  const latest = await (await request.get("/api/routine")).json();
  latest.routine.days.saturday.theme = "Updated from the computer";
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": latest.revision },
        data: { routine: latest.routine },
      })
    ).ok(),
  ).toBeTruthy();
  await page.clock.setFixedTime(new Date("2026-11-17T11:00:00Z"));
  const refreshed = page.waitForResponse(
    (res) =>
      res.url().endsWith("/api/routine") && res.request().method() === "GET",
  );
  await context.setOffline(false);
  expect((await refreshed).ok()).toBeTruthy();
  await expect(
    page.getByTestId("Templates-row-saturday").getByTestId("Templates-theme"),
  ).toHaveText("Updated from the computer");
  await expect(page.getByTestId("RoutineSync-toast")).toHaveCount(0);
});
test("refreshes on returning to the app without replacing an open template draft", async ({
  page,
  request,
}) => {
  await openEditor(page);
  await page.getByTestId("TemplateEditor-theme").fill("My draft stays open");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const latest = await (await request.get("/api/routine")).json();
  latest.routine.days.saturday.theme = "Saved on another device";
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": latest.revision },
        data: { routine: latest.routine },
      })
    ).ok(),
  ).toBeTruthy();
  const refreshed = page.waitForResponse(
    (res) =>
      res.url().endsWith("/api/routine") && res.request().method() === "GET",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect((await refreshed).ok()).toBeTruthy();
  await expect(page.getByTestId("TemplateEditor-theme")).toHaveValue(
    "My draft stays open",
  );
  await expect(page.getByTestId("TemplateEditor-remote-change")).toBeVisible();
  const saveResponse = page.waitForResponse(
    (res) => res.request().method() === "PUT",
  );
  await page.getByTestId("TemplateEditor-save").click();
  expect((await saveResponse).status()).toBe(412);
  await expect(page.getByTestId("TemplateEditor-theme")).toHaveValue(
    "My draft stays open",
  );
});
test("refresh failures show a dismissible toast with retry while preserving the routine", async ({
  page,
}) => {
  await page.goto("/templates?t=saturday");
  const row = page.getByTestId("Templates-row-saturday");
  await expect(row.getByTestId("Templates-edit")).toBeEnabled();
  await expect(page.getByTestId("RoutineSync-toast")).toHaveCount(0);
  await page.route("**/api/routine", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Unavailable" }),
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("RoutineSync-toast")).toBeVisible();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("Templates-edit")).toBeDisabled();
  await page.getByTestId("RoutineSync-dismiss").click();
  await expect(page.getByTestId("RoutineSync-toast")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("RoutineSync-toast")).toBeVisible();
  await page.unroute("**/api/routine");
  const refreshed = page.waitForResponse(
    (res) =>
      res.url().endsWith("/api/routine") && res.request().method() === "GET",
  );
  await page.getByTestId("RoutineSync-retry").click();
  expect((await refreshed).ok()).toBeTruthy();
  await expect(page.getByTestId("RoutineSync-toast")).toHaveCount(0);
  await expect(row.getByTestId("Templates-edit")).toBeEnabled();
});
test("manages shared blocks directly from the library and protects blocks that are in use", async ({
  page,
}) => {
  await page.goto("/templates");
  await page.getByTestId("Templates-blocks").click();
  await page.getByTestId("TemplateEditor-block-wake_up").click();
  await expect(page.getByTestId("TemplateEditor-block-delete")).toBeDisabled();
  await expect(
    page.getByTestId("TemplateEditor-block-references"),
  ).toBeVisible();
  await expect(page.getByTestId("TemplateEditor-block-back")).toHaveCount(0);
  await expect(page.getByTestId("TemplateEditor-block-name")).toHaveValue(
    "Wake up",
  );
  await page.getByTestId("TemplateEditor-block-name").fill("Morning start");
  await save(page);
  await page.reload();
  await page.getByTestId("Templates-blocks").click();
  await expect(page.getByTestId("TemplateEditor-block-wake_up")).toContainText(
    "Morning start",
  );
  await page.getByTestId("TemplateEditor-block-wake_up").click();
  await expect(page.getByTestId("TemplateEditor-block-name")).toHaveValue(
    "Morning start",
  );
  await expect(page.getByTestId("TemplateEditor-block-delete")).toBeDisabled();
  await page.getByTestId("TemplateEditor-cancel").click();
  await page.getByTestId("Templates-blocks").click();
  await page.getByTestId("TemplateEditor-block-new").click();
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("TemplateEditor-errors")).toBeVisible();
  await expect(page.getByTestId("TemplateEditor-block-name")).toBeVisible();
  await page.getByTestId("TemplateEditor-block-name").fill("Evening wind down");
  await expect(page.getByTestId("TemplateEditor-advanced")).toHaveCount(0);
  await expandEntries(page);
  await page.getByTestId("EntryEditor-title").fill("Read a book");
  await save(page);
  await page.reload();
  await page.getByTestId("Templates-blocks").click();
  await page.getByTestId("TemplateEditor-block-block").click();
  await expect(page.getByTestId("EntryEditor-title")).toHaveValue(
    "Read a book",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("TemplateEditor-block-delete").click();
  await save(page);
  await page.getByTestId("Templates-blocks").click();
  await expect(page.getByTestId("TemplateEditor-block-block")).toHaveCount(0);
});
