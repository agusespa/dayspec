import { expect, test, type Page } from "@playwright/test";
const activity = (title: string, time: string, duration = 10) => ({
  title,
  time,
  duration,
});
const fixture = {
  settings: { automatic_swedish_holidays: false },
  blocks: {
    stretch: {
      name: "Stretch",
      items: [{ title: "Stretch legs", duration: 10 }],
    },
  },
  days: {
    weekday: {
      on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      choices: {
        location: {
          label: "Work location",
          options: { home: { label: "Home" }, office: { label: "Office" } },
          default: "home",
        },
        gym: {
          label: "Gym",
          options: { train: { label: "Train" }, rest: { label: "Rest" } },
          default: "train",
        },
        evening: {
          label: "Evening",
          options: { out: { label: "Go out" }, stay: { label: "Stay home" } },
          default: "out",
        },
      },
      items: [
        activity("Breakfast", "07:00"),
        {
          alternative: "location",
          paths: {
            home: [
              activity("Work at home", "08:00"),
              {
                alternative: "gym",
                paths: { train: [activity("Lift", "17:00", 45)], rest: [] },
              },
            ],
            office: [
              { use: "stretch", time: "07:50" },
              activity("Office work", "08:30", 60),
            ],
          },
        },
        activity("Lunch", "12:00"),
        {
          alternative: "evening",
          paths: {
            out: [activity("Go dancing", "20:00")],
            stay: [activity("Read at home", "20:00")],
          },
        },
        activity("Bedtime", "23:00"),
      ],
    },
  },
};
let original: { routine: unknown; revision: string };
test.beforeEach(async ({ request }) => {
  original = await (await request.get("/api/routine")).json();
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": original.revision },
        data: { routine: fixture },
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
        data: { routine: original.routine },
      })
    ).ok(),
  ).toBeTruthy();
});
async function preview(page: Page) {
  await page.goto("/templates");
  await page
    .getByTestId("Templates-row-weekday")
    .getByTestId("Templates-open")
    .click();
}
async function edit(page: Page) {
  await page.goto("/templates");
  await page
    .getByTestId("Templates-row-weekday")
    .getByTestId("Templates-edit")
    .click();
}
const region = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });
test("previews explicit paths without changing common activities or saved data", async ({
  page,
  request,
}) => {
  await preview(page);
  const work = region(page, "Work location");
  await expect(work.getByText("Work at home", { exact: true })).toBeVisible();
  await expect(region(page, "Gym")).toBeVisible();
  await work.getByRole("button", { name: "Office", exact: true }).click();
  await expect(work.getByText("Office work", { exact: true })).toBeVisible();
  await expect(region(page, "Gym")).toHaveCount(0);
  await expect(page.getByText("Lunch", { exact: true })).toBeVisible();
  await expect(region(page, "Evening")).toBeVisible();
  expect((await (await request.get("/api/routine")).json()).routine).toEqual(
    fixture,
  );
});
test("edits activities in both paths and saves their actual nesting", async ({
  page,
  request,
}) => {
  await edit(page);
  const work = region(page, "Work location");
  const home = work
    .getByTestId("EntryEditor-entry")
    .filter({ hasText: "Work at home" });
  await home.getByTestId("EntryEditor-open").click();
  await home.getByTestId("EntryEditor-title").fill("Home projects");
  await work.getByRole("button", { name: "Office", exact: true }).click();
  const office = work
    .getByTestId("EntryEditor-entry")
    .filter({ hasText: "Office work" });
  await office.getByTestId("EntryEditor-open").click();
  await office.getByTestId("EntryEditor-title").fill("Office projects");
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  const saved = (await (await request.get("/api/routine")).json()).routine.days
    .weekday.items;
  expect(saved[1].paths.home[0].title).toBe("Home projects");
  expect(saved[1].paths.office[1].title).toBe("Office projects");
});
test("adds an empty fork and inserts an activity only into its selected path", async ({
  page,
  request,
}) => {
  await edit(page);
  await page
    .getByRole("button", { name: "+ Add branch", exact: true })
    .last()
    .click();
  await page
    .getByRole("combobox", { name: "Alternative for new branch" })
    .selectOption("gym");
  const gym = region(page, "Gym").last();
  await gym.getByRole("button", { name: "Rest", exact: true }).click();
  await expect(gym).toContainText("Continue routine");
  await gym.getByTestId("EntryEditor-add").click();
  await gym.getByTestId("EntryEditor-event").click();
  const item = gym.getByTestId("EntryEditor-entry");
  await item.getByTestId("EntryEditor-open").click();
  await item.getByTestId("EntryEditor-title").fill("Evening walk");
  await item.getByTestId("EntryEditor-time").fill("18:00");
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  const saved = (await (await request.get("/api/routine")).json()).routine.days
    .weekday.items;
  const fork = saved.find((entry) => entry.alternative === "gym");
  expect(fork.paths).toEqual({
    train: [],
    rest: [activity("Evening walk", "18:00", 5)],
  });
});
test("opens the selected option and activity directly from its source path", async ({
  page,
}) => {
  await page.goto("/templates?t=weekday&edit=1.1.1");
  const work = region(page, "Work location");
  await expect(
    work.getByRole("button", { name: "Office", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(work.getByTestId("EntryEditor-title")).toHaveValue(
    "Office work",
  );
});
test("opens a deeply nested activity from Daily and returns to the same day", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-18T12:00:00+01:00"));
  await page.goto("/");
  const lift = page.getByTestId("TimelineItem").filter({ hasText: "Lift" });
  await lift.getByTestId("TimelineItem-toggle").click();
  await lift.getByRole("link", { name: "Edit Lift", exact: true }).click();
  await expect(
    region(page, "Gym").getByTestId("EntryEditor-title"),
  ).toHaveValue("Lift");
  await page.getByTestId("TemplateEditor-cancel").click();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
});
test("child alternatives depend on containment and later forks remain independent", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("radiogroup", { name: "Gym", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Stay home", exact: true }).click();
  await page.getByRole("radio", { name: "Office", exact: true }).click();
  await expect(
    page.getByRole("radiogroup", { name: "Gym", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: "Stay home", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Read at home", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("radiogroup", { name: "Gym", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Stay home", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
});
test("shows defaults in the selected path without rule subtitles or availability controls", async ({
  page,
}) => {
  await preview(page);
  await expect(
    region(page, "Work location").locator(".branch-details").first(),
  ).toContainText("Default");
  await expect(page.locator(".branch-conditions")).toHaveCount(0);
  await edit(page);
  await page
    .getByTestId("ChoiceEditor-location")
    .getByTestId("ChoiceEditor-open")
    .click();
  await expect(page.getByTestId("ConditionsEditor")).toHaveCount(0);
  await expect(page.getByText("Available when", { exact: true })).toHaveCount(
    0,
  );
});
test("prevents nesting an alternative inside itself in the editor", async ({
  page,
}) => {
  await edit(page);
  const gym = region(page, "Gym");
  await gym.getByRole("button", { name: "+ Add branch", exact: true }).click();
  const select = gym.getByRole("combobox", {
    name: "Alternative for new branch",
  });
  await expect(select.locator('option[value="location"]')).toHaveCount(0);
  await expect(select.locator('option[value="gym"]')).toHaveCount(0);
  await expect(select.locator('option[value="evening"]')).toHaveCount(1);
});
test("deleting a fork uses the app modal and removes all its paths only after save", async ({
  page,
  request,
}) => {
  await edit(page);
  await page
    .getByRole("button", { name: "Delete branch Work location", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Delete branch?",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(region(page, "Work location")).toBeVisible();
  await page
    .getByRole("button", { name: "Delete branch Work location", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(region(page, "Work location")).toHaveCount(0);
  expect((await (await request.get("/api/routine")).json()).routine).toEqual(
    fixture,
  );
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  const items = (await (await request.get("/api/routine")).json()).routine.days
    .weekday.items;
  expect(items.map((entry) => entry.alternative ?? entry.title)).toEqual([
    "Breakfast",
    "Lunch",
    "evening",
    "Bedtime",
  ]);
});
test("an unassigned fork can be dismissed without changing the routine", async ({
  page,
  request,
}) => {
  await edit(page);
  await page
    .getByRole("button", { name: "+ Add branch", exact: true })
    .last()
    .click();
  await expect(region(page, "New branch")).toBeVisible();
  await page
    .getByRole("button", { name: "Delete new branch", exact: true })
    .click();
  await expect(region(page, "New branch")).toHaveCount(0);
  expect((await (await request.get("/api/routine")).json()).routine).toEqual(
    fixture,
  );
});
for (const width of [390, 1440]) {
  test(`fork paths remain within the viewport and align their timeline at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await preview(page);
    await expect(region(page, "Work location")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const points = await region(page, "Work location")
      .locator(".item > .time")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().left),
      );
    if (points.length > 1)
      expect(Math.max(...points) - Math.min(...points)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `test-results/forks-${width}.png`,
      fullPage: true,
    });
  });
  test(`add menus dismiss outside and with Escape at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await edit(page);
    const add = page.getByTestId("EntryEditor-add").last();
    await add.click();
    await expect(page.getByTestId("EntryEditor-event").last()).toBeVisible();
    await page
      .getByRole("heading", { name: "Edit template", exact: true })
      .click();
    await expect(
      page.getByTestId("EntryEditor-event").last(),
    ).not.toBeVisible();
    await add.click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByTestId("EntryEditor-event").last(),
    ).not.toBeVisible();
  });
}
