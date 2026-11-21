import { readFileSync } from "node:fs";
import { expect, test, type Page } from "./test";
import type { Routine } from "../web/src/lib/routine/types.ts";
import { sortRoutineByTime } from "../web/src/lib/routine/edit.ts";
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
  await expect(page.getByTestId("TemplateEditor-status")).toHaveText(
    "All changes saved",
  );
  await page.getByTestId("TemplateEditor-back").click();
}
test("saves template edits across reloads and devices", async ({
  page,
  browser,
  request,
}) => {
  await openEditor(page);
  await expect(
    page.getByRole("textbox", { name: "Theme", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Focus", exact: true })
    .fill("A quieter Saturday");
  const index = testRoutine.templates.saturday.items.findIndex(
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
  await page
    .getByTestId("Templates-row-saturday")
    .getByTestId("Templates-open")
    .click();
  await expect(page.getByText("A quieter Saturday")).toBeVisible();
  await expect(page.getByText("A new Saturday activity")).toBeVisible();
  const persisted = await (await request.get("/api/routine")).json();
  expect(persisted.routine.blocks).toEqual(testRoutine.blocks);
  expect(persisted.routine.templates.saturday.choices).toEqual(
    testRoutine.templates.saturday.choices,
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
  await page.getByTestId("SharedBlocks-edit-wake_up").click();
  await expect(page.getByTestId("EntryEditor-title")).toBeHidden();
  await expandEntries(page);
  await page.getByTestId("EntryEditor-title").fill("Wake refreshed");
  await save(page);
  const persisted = await (await request.get("/api/routine")).json();
  expect(persisted.routine.blocks.wake_up.items[0].title).toBe(
    "Wake refreshed",
  );
  await page.reload();
  await page
    .getByTestId("Templates-row-saturday")
    .getByTestId("Templates-open")
    .click();
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
  await expect(page.getByTestId("TemplateEditor-day-sat")).toBeChecked();
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
  expect(saved).toEqual(
    sortRoutineByTime({
      ...testRoutine,
      templates: {
        ...testRoutine.templates,
        saturday: {
          ...testRoutine.templates.saturday,
          theme: "Focused Saturday",
        },
      },
    }),
  );
});
test("a stale save preserves the draft and cannot overwrite another device’s edits", async ({
  page,
  request,
}) => {
  await openEditor(page);
  await page.getByTestId("TemplateEditor-theme").fill("My unsaved draft");
  const latest = await (await request.get("/api/routine")).json();
  latest.routine.templates.saturday.theme = "Changed on another device";
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
    (await (await request.get("/api/routine")).json()).routine.templates
      .saturday.theme,
  ).toBe("Changed on another device");
  await page.getByTestId("TemplateEditor-reload").click();
  const dialog = page.getByRole("dialog", { name: "Discard changes?" });
  await expect(dialog).toContainText("latest saved templates");
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(page.getByTestId("TemplateEditor-theme")).toHaveValue(
    "My unsaved draft",
  );
  await page.getByTestId("TemplateEditor-reload").click();
  await dialog
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByTestId("TemplateEditor-theme")).toHaveValue(
    "Changed on another device",
  );
  await expect(page.getByTestId("TemplateEditor-save")).toBeDisabled();
});
test("cancel protection leaves the saved routine unchanged", async ({
  page,
  request,
}) => {
  await openEditor(page);
  await page.getByTestId("TemplateEditor-theme").fill("Discard this");
  await page.getByTestId("TemplateEditor-back").click();
  await expect(
    page.getByRole("dialog", { name: "Discard changes?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Keep editing", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("TemplateEditor-theme")).toHaveValue(
    "Discard this",
  );
  await expect(page.getByTestId("TemplateEditor-back")).toBeFocused();
  await page.getByTestId("TemplateEditor-back").click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByTestId("TemplateEditor")).toBeVisible();
  await page.getByTestId("TemplateEditor-back").click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByTestId("TemplateEditor")).toHaveCount(0);
  expect((await (await request.get("/api/routine")).json()).routine).toEqual(
    testRoutine,
  );
});
test("edits activity notes and orders entries by start time without losing details", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine = {
    templates: {
      saturday: {
        on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        items: [
          { title: "First", time: "08:00", note: "Water", duration: 5 },
          { title: "Second", time: "09:00", duration: 5 },
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
  const secondTime = page
    .getByTestId("EntryEditor-entry")
    .last()
    .getByTestId("EntryEditor-time");
  await secondTime.fill("07:00");
  await secondTime.blur();
  await expect(page.getByTestId("EntryEditor-up")).toHaveCount(0);
  await expect(page.getByTestId("EntryEditor-down")).toHaveCount(0);
  await save(page);
  const persisted = (await (await request.get("/api/routine")).json()).routine;
  expect(persisted.templates.saturday.items).toEqual([
    { title: "Second", time: "07:00", duration: 5 },
    { title: "First", time: "08:00", note: "Water\nWash face", duration: 5 },
  ]);
  await page.reload();
  await page
    .getByTestId("Templates-row-saturday")
    .getByTestId("Templates-open")
    .click();
  await page
    .getByTestId("TimelineItem")
    .filter({ hasText: "First" })
    .getByTestId("TimelineItem-toggle")
    .click();
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
  latest.routine.templates.saturday.theme = "Updated from the computer";
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
  latest.routine.templates.saturday.theme = "Saved on another device";
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
test("manages shared blocks directly from the library and asks how to delete blocks that are in use", async ({
  page,
}) => {
  await page.goto("/templates");
  const usedCard = page.getByTestId("SharedBlocks-card-wake_up");
  await expect(usedCard).toContainText("Used by");
  await usedCard.getByTestId("SharedBlocks-delete").click();
  const dialog = page.getByRole("dialog", { name: "Delete routine?" });
  await expect(dialog.getByTestId("SharedBlocks-delete-explode")).toBeFocused();
  await expect(dialog.getByTestId("SharedBlocks-delete-remove")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByTestId("SharedBlocks-edit-wake_up").click();
  await expect(page.getByTestId("SharedBlocks-delete")).toHaveCount(0);
  await expect(page.getByTestId("TemplateEditor-block-name")).toHaveValue(
    "Wake up",
  );
  await page.getByTestId("TemplateEditor-block-name").fill("Morning start");
  await save(page);
  await page.reload();
  await expect(page.getByTestId("SharedBlocks-card-wake_up")).toContainText(
    "Morning start",
  );
  await page.getByTestId("SharedBlocks-edit-wake_up").click();
  await expect(page.getByTestId("TemplateEditor-block-name")).toHaveValue(
    "Morning start",
  );
  await expect(page.getByTestId("SharedBlocks-delete")).toHaveCount(0);
  await page.getByTestId("TemplateEditor-back").click();
  await expect(page.getByTestId("SharedBlocks-list")).toBeVisible();
  await page.getByTestId("SharedBlocks-new").click();
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("TemplateEditor-errors")).toBeVisible();
  await expect(page.getByTestId("TemplateEditor-block-name")).toBeVisible();
  await page.getByTestId("TemplateEditor-block-name").fill("Evening wind down");
  await expect(page.getByTestId("TemplateEditor-advanced")).toHaveCount(0);
  await expandEntries(page);
  await page.getByTestId("EntryEditor-title").fill("Read a book");
  await save(page);
  await page.reload();
  await page.getByTestId("SharedBlocks-edit-block").click();
  await expect(page.getByTestId("EntryEditor-title")).toHaveValue(
    "Read a book",
  );
  await expect(page.getByTestId("SharedBlocks-delete")).toHaveCount(0);
  await page.getByTestId("TemplateEditor-back").click();
  const createdCard = page.getByTestId("SharedBlocks-card-block");
  await createdCard
    .getByRole("button", {
      name: "Delete routine Evening wind down",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(createdCard).toBeVisible();
  await page.route("**/api/routine", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Could not delete block. Try again." }),
        })
      : route.continue(),
  );
  await createdCard.getByTestId("SharedBlocks-delete").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByTestId("SharedBlocks-error")).toContainText(
    "Could not delete block",
  );
  await expect(createdCard).toBeVisible();
  await page.unroute("**/api/routine");
  await createdCard.getByTestId("SharedBlocks-delete").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(createdCard).toHaveCount(0);
  await expect(page.getByTestId("SharedBlocks-list")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("SharedBlocks-edit-block")).toHaveCount(0);
});
test("back returns to the library and discards only confirmed edits", async ({
  page,
  request,
}) => {
  await page.goto("/templates");
  await page.getByTestId("SharedBlocks-edit-wake_up").click();
  await page.getByTestId("TemplateEditor-block-name").fill("Discard this name");
  await expandEntries(page);
  await page.getByTestId("EntryEditor-title").fill("Discard this activity");
  await page.getByTestId("TemplateEditor-back").click();
  await expect(
    page.getByRole("dialog", { name: "Discard changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByTestId("TemplateEditor-block-name")).toHaveValue(
    "Discard this name",
  );
  await page.getByTestId("TemplateEditor-back").click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByTestId("SharedBlocks-list")).toBeVisible();
  await expect(page.getByTestId("TemplateEditor-save")).toHaveCount(0);
  await page.getByTestId("SharedBlocks-edit-wake_up").click();
  await expect(page.getByTestId("TemplateEditor-block-name")).toHaveValue(
    testRoutine.blocks.wake_up.name,
  );
  await expandEntries(page);
  await expect(page.getByTestId("EntryEditor-title")).toHaveValue(
    testRoutine.blocks.wake_up.items[0].title,
  );
  await page.getByTestId("TemplateEditor-back").click();
  await page.getByTestId("SharedBlocks-new").click();
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("TemplateEditor-errors")).toBeVisible();
  await page.getByTestId("TemplateEditor-back").click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByTestId("SharedBlocks-list")).toBeVisible();
  await expect(page.getByTestId("SharedBlocks-edit-block")).toHaveCount(0);
  await expect(page.getByTestId("TemplateEditor-errors")).toHaveCount(0);
  await expect(page.getByTestId("TemplateEditor-save")).toHaveCount(0);
  await expect(page.getByTestId("Templates-list")).toBeVisible();
  expect((await (await request.get("/api/routine")).json()).routine).toEqual(
    testRoutine,
  );
});
test("new activities and shared blocks follow their start times in the editor", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine = {
    blocks: { wake_up: testRoutine.blocks.wake_up },
    templates: {
      saturday: {
        on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        items: [
          { title: "Early routine", time: "07:00", duration: 5 },
          { title: "Dinner", time: "18:00", duration: 30 },
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
  await page.getByTestId("EntryEditor-add").click();
  await page.getByTestId("EntryEditor-activity").click();
  const titles = page.getByTestId("EntryEditor-open").locator(".summary-title");
  await expect(titles).toHaveText(["Early routine", "Dinner"]);
  const dialog = page.getByRole("dialog", {
    name: "Add activity",
    exact: true,
  });
  await dialog.getByTestId("EntryEditor-title").fill("Mid-morning break");
  await dialog.getByTestId("EntryEditor-time").fill("10:30");
  await dialog
    .getByRole("button", { name: "Add activity", exact: true })
    .click();
  await expect(titles).toHaveText([
    "Early routine",
    "Mid-morning break",
    "Dinner",
  ]);
  const activity = page
    .getByTestId("EntryEditor-entry")
    .filter({ hasText: "Mid-morning break" });
  await expect(activity.getByTestId("EntryEditor-time")).toBeVisible();
  await page.getByTestId("EntryEditor-add").click();
  await page.getByTestId("EntryEditor-use").click();
  const blockDialog = page.getByRole("dialog", {
    name: "Add routine",
    exact: true,
  });
  await blockDialog.getByTestId("EntryEditor-block").selectOption("wake_up");
  await blockDialog.getByTestId("EntryEditor-time").fill("06:30");
  await blockDialog
    .getByRole("button", { name: "Add routine", exact: true })
    .click();
  const block = page
    .getByTestId("EntryEditor-entry")
    .filter({ has: page.getByTestId("EntryEditor-block") });
  await expect(titles).toHaveText([
    "Wake up",
    "Early routine",
    "Mid-morning break",
    "Dinner",
  ]);
  await expect(block.getByTestId("EntryEditor-time")).toBeVisible();
  await expect(block.getByTestId("EntryEditor-time")).toHaveValue("06:30");
  await save(page);
  const saved = (await (await request.get("/api/routine")).json()).routine;
  expect(saved.templates.saturday.items).toEqual([
    { use: "wake_up", time: "06:30" },
    routine.templates.saturday.items[0],
    { title: "Mid-morning break", time: "10:30", duration: 5 },
    routine.templates.saturday.items[1],
  ]);
});
test("activities and blocks have no per-item condition controls", async ({
  page,
}) => {
  await page.goto("/templates");
  for (const key of ["wake_up", "gym_evening"]) {
    await page.getByTestId(`SharedBlocks-edit-${key}`).click();
    await expandEntries(page);
    await expect(page.getByTestId("ConditionsEditor")).toHaveCount(0);
    await expect(page.getByTestId("BranchSection")).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Choice for new branch" }),
    ).toHaveCount(0);
    await page.getByTestId("TemplateEditor-back").click();
  }
  await page
    .getByTestId("Templates-row-saturday")
    .getByTestId("Templates-edit")
    .click();
  const block = page
    .getByTestId("EntryEditor-entry")
    .filter({ has: page.getByTestId("EntryEditor-block") })
    .first();
  await block.getByTestId("EntryEditor-open").first().click();
  await expect(block.getByTestId("ConditionsEditor")).toHaveCount(0);
  await expandEntries(page);
  await expect(
    page.locator(".editor-timeline").getByTestId("ConditionsEditor"),
  ).toHaveCount(0);
  await expect(
    page.locator(".editor-timeline").getByText("Show when", { exact: true }),
  ).toHaveCount(0);
});
test("shared block contents retain sequence controls without fixed times", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine = {
    templates: {},
    blocks: {
      morning: {
        name: "Morning",
        items: [{ title: "Wash", duration: 5 }, { use: "tea" }],
      },
      tea: { name: "Tea", items: [{ title: "Make tea", duration: 10 }] },
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
  await page.goto("/templates");
  await page.getByTestId("SharedBlocks-edit-morning").click();
  await expandEntries(page);
  await expect(page.getByTestId("EntryEditor-time")).toHaveCount(0);
  await expect(page.getByTestId("EntryEditor-up")).toHaveCount(2);
  await page.getByTestId("EntryEditor-up").last().click();
  await save(page);
  const saved = (await (await request.get("/api/routine")).json()).routine;
  expect(saved.blocks.morning.items).toEqual([
    { use: "tea" },
    { title: "Wash", duration: 5 },
  ]);
});
test("browser back uses the discard modal and resumes only after confirmation", async ({
  page,
  request,
}) => {
  await page.goto("/profile");
  await page.getByRole("link", { name: "Templates", exact: true }).click();
  await page
    .getByTestId("Templates-row-saturday")
    .getByTestId("Templates-edit")
    .click();
  await page
    .getByTestId("TemplateEditor-theme")
    .fill("Unsaved navigation draft");
  await page.evaluate(() => history.back());
  const dialog = page.getByRole("dialog", { name: "Discard changes?" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/templates$/);
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(page.getByTestId("TemplateEditor-theme")).toHaveValue(
    "Unsaved navigation draft",
  );
  await page.evaluate(() => history.back());
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  expect((await (await request.get("/api/routine")).json()).routine).toEqual(
    testRoutine,
  );
});
test("browser reload and tab close warn only for unsaved changes", async ({
  page,
}) => {
  await openEditor(page);
  await page
    .getByTestId("TemplateEditor-theme")
    .fill("Protected browser reload draft");
  const warning = page.waitForEvent("dialog");
  const reload = page.evaluate(() => location.reload()).catch(() => undefined);
  const dialog = await warning;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await reload;
  await expect(page.getByTestId("TemplateEditor-theme")).toHaveValue(
    "Protected browser reload draft",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const closeWarning = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const closeDialog = await closeWarning;
  expect(closeDialog.type()).toBe("beforeunload");
  await closeDialog.dismiss();
  expect(page.isClosed()).toBe(false);
  await expect(page.getByTestId("TemplateEditor-theme")).toHaveValue(
    "Protected browser reload draft",
  );
  await save(page);
  const unexpected: string[] = [];
  page.on("dialog", async (dialog) => {
    unexpected.push(dialog.type());
    await dialog.dismiss();
  });
  await openEditor(page);
  await page.reload();
  await expect(page.getByTestId("Templates-list")).toBeVisible();
  expect(unexpected).toEqual([]);
});
test("deletes a template directly from its card and preserves the rest of the library", async ({
  page,
  request,
}) => {
  await page.goto("/templates?t=saturday");
  const card = page.getByTestId("Templates-row-saturday");
  await expect(card.getByTestId("Templates-open")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await card
    .getByRole("button", { name: "Delete Saturday template", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId("TemplateEditor")).toHaveCount(0);
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByTestId("Templates-unassigned")).toContainText("Sat");
  const expected = sortRoutineByTime(structuredClone(testRoutine));
  delete expected.templates.saturday;
  delete expected.settings.holiday_template;
  expect((await (await request.get("/api/routine")).json()).routine).toEqual(
    expected,
  );
  await page.reload();
  await expect(card).toHaveCount(0);
  await expect(
    page.getByTestId("Templates-list").locator("article"),
  ).toHaveCount(Object.keys(expected.templates).length);
});
test("existing shared blocks are time ordered on open, including inside branches and edit links", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine = {
    blocks: {
      wake: { name: "Wake up", items: [{ title: "Drink water", duration: 5 }] },
    },
    templates: {
      saturday: {
        on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        choices: {
          gym: {
            label: "Gym",
            options: { yes: { label: "Yes" }, no: { label: "No" } },
            default: "yes",
          },
        },
        items: [
          { title: "Dinner", time: "19:00", duration: 30 },
          {
            choice: "gym",
            paths: {
              yes: [
                { title: "Workout", time: "10:00", duration: 30 },
                { use: "wake", time: "08:00" },
              ],
              no: [],
            },
          },
          { use: "wake", time: "06:50" },
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
  await page.goto("/templates?t=saturday");
  const flow = page.locator(".template-flow");
  const previewHeadings = flow.locator(
    ":scope > .timeline > .item:not(.timeline-gap) .title-text, :scope > .branch-section > .branch-heading > span",
  );
  await expect(previewHeadings).toHaveText(["Wake up", "Gym", "Dinner"]);
  await page.getByTestId("Templates-edit").click();
  const headings = page.locator(
    ".editor-timeline > .entries > .entry > summary .summary-title, .editor-timeline > .entries > .branch-section > .branch-heading > span",
  );
  await expect(headings).toHaveText(["Wake up", "Gym", "Dinner"]);
  const gym = page.getByRole("region", { name: "Gym", exact: true });
  await expect(
    gym.getByTestId("EntryEditor-open").locator(".summary-title"),
  ).toHaveText(["Wake up", "Workout"]);
  await expect(page.getByTestId("TemplateEditor-save")).toBeDisabled();
  // Merely viewing the sorted routine must not write or change its revision.
  expect((await (await request.get("/api/routine")).json()).routine).toEqual(
    routine,
  );
  await page.getByTestId("TemplateEditor-theme").fill("Sorted routine");
  await save(page);
  const saved = (await (await request.get("/api/routine")).json()).routine;
  expect(saved.templates.saturday.items[0]).toEqual({
    use: "wake",
    time: "06:50",
  });
  expect(saved.templates.saturday.items[1].paths.yes[0]).toEqual({
    use: "wake",
    time: "08:00",
  });
  const latest = await (await request.get("/api/routine")).json();
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": latest.revision },
        data: { routine },
      })
    ).ok(),
  ).toBeTruthy();
  // Daily edit paths must use the same loaded order as the editor.
  await page.goto("/");
  const workout = page
    .getByTestId("TimelineItem")
    .filter({ hasText: "Workout" });
  await workout.getByTestId("TimelineItem-toggle").click();
  await workout
    .getByRole("link", { name: "Edit Workout", exact: true })
    .click();
  await expect(
    page.getByTestId("EntryEditor-title").filter({ visible: true }),
  ).toHaveValue("Workout");
});

test("a shared block draft survives a remote edit and reloads the saved name", async ({
  page,
  request,
}) => {
  await page.goto("/templates");
  await page.getByTestId("SharedBlocks-edit-wake_up").click();
  const name = page.getByTestId("TemplateEditor-block-name");
  await name.fill("My unsaved name");
  const latest = await (await request.get("/api/routine")).json();
  latest.routine.blocks.wake_up.name = "Saved on another device";
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": latest.revision },
        data: { routine: latest.routine },
      })
    ).ok(),
  ).toBeTruthy();
  const refresh = page.waitForResponse(
    (res) =>
      res.url().endsWith("/api/routine") && res.request().method() === "GET",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refresh;
  await expect(page.getByTestId("TemplateEditor-remote-change")).toBeVisible();
  const save = page.waitForResponse((res) => res.request().method() === "PUT");
  await page.getByTestId("TemplateEditor-save").click();
  expect((await save).status()).toBe(412);
  await expect(name).toHaveValue("My unsaved name");
  await page.getByTestId("TemplateEditor-reload").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(name).toHaveValue("Saved on another device");
  await expect(page.getByTestId("TemplateEditor-save")).toBeDisabled();
});

test("reloading after another device removes a shared block returns safely to its list", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  current.routine.blocks.spare = {
    name: "Spare",
    items: [{ title: "Read", duration: 5 }],
  };
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine: current.routine },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/templates");
  await page.getByTestId("SharedBlocks-edit-spare").click();
  await page.getByTestId("TemplateEditor-block-name").fill("Unsaved");
  const latest = await (await request.get("/api/routine")).json();
  delete latest.routine.blocks.spare;
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": latest.revision },
        data: { routine: latest.routine },
      })
    ).ok(),
  ).toBeTruthy();
  const refresh = page.waitForResponse(
    (res) =>
      res.url().endsWith("/api/routine") && res.request().method() === "GET",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refresh;
  await page.getByTestId("TemplateEditor-reload").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByTestId("SharedBlocks-list")).toBeVisible();
  await expect(page.getByTestId("SharedBlocks-edit-spare")).toHaveCount(0);
});
