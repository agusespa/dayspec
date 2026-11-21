import { expect, test } from "./test";
const fixture = {
  settings: { automatic_swedish_holidays: false },
  categories: { health: { name: "Health", color: "green" } },
  blocks: {
    morning: { name: "Morning", items: [{ title: "Stretch", duration: 10 }] },
    evening: { name: "Wind down", items: [{ title: "Read", duration: 15 }] },
  },
  templates: {
    daily: {
      on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      items: [
        { title: "Breakfast", time: "07:00", duration: 20 },
        { title: "Dinner", time: "18:00", duration: 30 },
      ],
    },
  },
};
let original: unknown;
test.beforeEach(async ({ page, request }) => {
  const current = await (await request.get("/api/routine")).json();
  original = current.routine;
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine: fixture },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/templates");
  await page
    .getByTestId("Templates-row-daily")
    .getByTestId("Templates-edit")
    .click();
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
for (const width of [390, 1440]) {
  test(`activity drafts cancel cleanly and only enter the timeline after confirmation at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    const addMenu = page.getByTestId("EntryEditor-add");
    await addMenu.click();
    await expect(
      page.getByRole("button", { name: "Event", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Add activity",
      exact: true,
    });
    const title = dialog.getByTestId("EntryEditor-title");
    const time = dialog.getByTestId("EntryEditor-time");
    await expect(title).toBeFocused();
    await expect(title).toHaveValue("");
    await expect(time).toHaveValue("");
    await title.fill("Unsaved draft");
    await time.fill("10:30");
    await expect(page.getByTestId("EntryEditor-entry")).toHaveCount(2);
    await expect(page.getByTestId("TemplateEditor-save")).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(addMenu).toBeFocused();
    await addMenu.click();
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(title).toHaveValue("");
    await expect(time).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(addMenu).toBeFocused();
    await expect(page.getByTestId("TemplateEditor-save")).toBeDisabled();
    expect((await (await request.get("/api/routine")).json()).routine).toEqual(
      fixture,
    );
  });
  test(`activities validate, retain details and reveal their sorted card at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.getByTestId("EntryEditor-add").click();
    await page.getByTestId("EntryEditor-activity").click();
    const dialog = page.getByRole("dialog", {
      name: "Add activity",
      exact: true,
    });
    const confirm = dialog.getByRole("button", {
      name: "Add activity",
      exact: true,
    });
    await confirm.click();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("EntryEditor-entry")).toHaveCount(2);
    await dialog.getByTestId("EntryEditor-title").fill("   ");
    await dialog.getByTestId("EntryEditor-time").fill("10:30");
    await confirm.click();
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("EntryEditor-title").fill("  Mid-morning break  ");
    await dialog.getByTestId("EntryEditor-duration").fill("0");
    await confirm.click();
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("EntryEditor-duration").fill("15");
    await dialog.getByTestId("EntryEditor-category").selectOption("health");
    await dialog.getByRole("checkbox", { name: "Alert", exact: true }).check();
    await dialog
      .getByRole("checkbox", { name: "Approximate time", exact: true })
      .check();
    const note = dialog.getByTestId("EntryEditor-note");
    await note.fill("Go outside");
    await note.press("Enter");
    await note.press("a");
    await expect(dialog).toBeVisible();
    await expect(note).toHaveValue("Go outside\na");
    await note.fill("Go outside\nDrink water");
    const link = dialog.getByTestId("EntryEditor-link");
    await link.fill("not a url");
    await confirm.click();
    await expect(dialog).toBeVisible();
    await link.fill("https://www.notion.so/break");
    // None of the modal controls belong to the surrounding library form.
    expect(
      await dialog
        .locator("input, select, textarea")
        .evaluateAll((nodes) =>
          nodes.every((node) => !(node as HTMLInputElement).form),
        ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/add-activity-${width}.png` });
    const buttonBox = await confirm.boundingBox();
    expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(700);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // Enter adds the activity, without saving the entire template.
    await link.press("Enter");
    await expect(dialog).toHaveCount(0);
    const added = page
      .getByTestId("EntryEditor-entry")
      .filter({ hasText: "Mid-morning break" });
    await expect(added.getByTestId("EntryEditor-time")).toBeVisible();
    await expect(added.getByTestId("EntryEditor-title")).toHaveValue(
      "Mid-morning break",
    );
    await expect(added).toBeInViewport();
    await expect(
      page.getByTestId("EntryEditor-open").locator(".summary-title"),
    ).toHaveText(["Breakfast", "Mid-morning break", "Dinner"]);
    expect((await (await request.get("/api/routine")).json()).routine).toEqual(
      fixture,
    );
    await page.getByTestId("TemplateEditor-save").click();
    await expect(page.getByTestId("TemplateEditor-status")).toHaveText(
      "All changes saved",
    );
    await page.getByTestId("TemplateEditor-back").click();
    const saved = (await (await request.get("/api/routine")).json()).routine;
    expect(saved.templates.daily.items[1]).toEqual({
      title: "Mid-morning break",
      time: "10:30",
      duration: 15,
      category: "health",
      alert: true,
      approx: true,
      note: "Go outside\nDrink water",
      link: "https://www.notion.so/break",
    });
  });
}
test("shared blocks require a selected block and start time before insertion", async ({
  page,
  request,
}) => {
  await page.getByTestId("EntryEditor-add").click();
  await page.getByTestId("EntryEditor-use").click();
  const dialog = page.getByRole("dialog", {
    name: "Add routine",
    exact: true,
  });
  const select = dialog.getByTestId("EntryEditor-block");
  const time = dialog.getByTestId("EntryEditor-time");
  const confirm = dialog.getByRole("button", {
    name: "Add routine",
    exact: true,
  });
  await expect(select).toHaveValue("");
  await expect(time).toHaveValue("");
  await expect(dialog.getByTestId("EntryEditor-duration")).toHaveCount(0);
  await expect(dialog.getByTestId("EntryEditor-title")).toHaveCount(0);
  await confirm.click();
  await expect(page.getByTestId("EntryEditor-entry")).toHaveCount(2);
  await select.selectOption("evening");
  await confirm.click();
  await expect(page.getByTestId("EntryEditor-entry")).toHaveCount(2);
  await time.fill("19:00");
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByTestId("EntryEditor-open").locator(".summary-title"),
  ).toHaveText(["Breakfast", "Dinner", "Wind down"]);
  await expect(
    page
      .getByTestId("EntryEditor-entry")
      .last()
      .getByTestId("EntryEditor-time"),
  ).toBeVisible();
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("TemplateEditor-status")).toHaveText(
    "All changes saved",
  );
  await page.getByTestId("TemplateEditor-back").click();
  expect(
    (await (await request.get("/api/routine")).json()).routine.templates.daily
      .items[2],
  ).toEqual({ use: "evening", time: "19:00" });
});
