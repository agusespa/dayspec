import { expect, test, type Page } from "@playwright/test";
import type { Routine } from "../web/src/lib/routine/types.ts";
const fixture: Routine = {
  blocks: {
    stretch: {
      name: "Stretch",
      items: [{ title: "Stretch gently", duration: 5 }],
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
        gym: { label: "Gym", type: "toggle", default: true },
      },
      items: [
        { title: "Breakfast", time: "07:00", duration: 15 },
        {
          when: { location: "home" },
          items: [{ title: "Work at home", time: "08:30", duration: 60 }],
        },
        {
          when: { location: "office" },
          items: [
            { title: "Commute", time: "08:00", duration: 30 },
            { title: "Office work", time: "08:30", duration: 60 },
          ],
        },
        { title: "Lunch", time: "12:00", duration: 30 },
        {
          when: { gym: true, location: "office" },
          items: [{ title: "Lift", time: "18:00", duration: 45 }],
        },
        {
          when: { gym: false },
          items: [{ title: "Rest", time: "18:00", duration: 45 }],
        },
        { title: "Dinner", time: "19:00", duration: 30 },
      ],
    },
  },
};
let original: Routine;
test.beforeEach(async ({ request }) => {
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
async function edit(page: Page) {
  await page.goto("/templates?t=weekday");
  await page
    .getByRole("button", { name: "Edit Daily template", exact: true })
    .click();
}
test("preview shows alternative paths, preserves common items and does not change saved data", async ({
  page,
  request,
}) => {
  await page.goto("/templates?t=weekday");
  const work = page.getByRole("region", { name: "Work location", exact: true });
  await expect(work.getByText("Work at home", { exact: true })).toBeVisible();
  await expect(work.locator(".branch-conditions")).toHaveCount(0);
  await expect(work.getByText("Commute", { exact: true })).toHaveCount(0);
  await work.getByRole("button", { name: "Office", exact: true }).click();
  await expect(work.getByText("Commute", { exact: true })).toBeVisible();
  await expect(work.locator(".branch-conditions")).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Gym", exact: true })
      .locator(".branch-conditions"),
  ).toHaveText("Work location: Office");
  await expect(work.getByText("Work at home", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Breakfast", { exact: true })).toBeVisible();
  await expect(page.getByText("Lunch", { exact: true })).toBeVisible();
  expect((await (await request.get("/api/routine")).json()).routine).toEqual(
    fixture,
  );
  await page.screenshot({
    path: "test-results/branches-preview-mobile.png",
    fullPage: true,
  });
});
test("edits both alternatives, adds a shared block with inherited condition and preserves combined conditions", async ({
  page,
  request,
}) => {
  await edit(page);
  const work = page.getByRole("region", { name: "Work location", exact: true });
  await work.getByTestId("EntryEditor-open").first().click();
  await work.getByTestId("EntryEditor-title").first().fill("Focus at home");
  await work.getByRole("button", { name: "Office", exact: true }).click();
  await work.getByTestId("EntryEditor-open").first().click();
  await work.getByTestId("EntryEditor-title").first().fill("Train to office");
  await work.getByTestId("EntryEditor-add").click();
  await work.getByTestId("EntryEditor-use").click();
  await expect(work.getByTestId("ConditionsEditor")).toHaveCount(0);
  const gym = page.getByRole("region", { name: "Gym", exact: true });
  await expect(gym).toContainText("Work location: Office");
  await gym.getByRole("button", { name: "Off", exact: true }).click();
  await expect(gym).toContainText("Rest");
  await page.screenshot({
    path: "test-results/branches-editor-mobile.png",
    fullPage: true,
  });
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  const saved = (await (await request.get("/api/routine")).json()).routine;
  const home = saved.days.weekday.items.find(
    (entry) => entry.when?.location === "home",
  );
  const office = saved.days.weekday.items.find(
    (entry) => entry.when?.location === "office" && !entry.when.gym,
  );
  expect(home.items[0].title).toBe("Focus at home");
  expect(office.items[0].title).toBe("Train to office");
  expect(office.items[1]).toEqual({
    use: "stretch",
    time: "08:00",
  });
  expect(saved.days.weekday.items[4]).toEqual(fixture.days.weekday.items[4]);
  await page.reload();
  await page
    .getByRole("region", { name: "Work location", exact: true })
    .getByRole("button", { name: "Office", exact: true })
    .click();
  await expect(
    page.getByText("Train to office", { exact: true }),
  ).toBeVisible();
});
test("creates an empty toggle section and assigns new activity to the chosen side", async ({
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
    .last()
    .selectOption("gym");
  const gym = page.getByRole("region", { name: "Gym", exact: true }).last();
  await gym.getByRole("button", { name: "Off", exact: true }).click();
  await expect(gym).toContainText("Continue routine");
  await gym.getByTestId("EntryEditor-add").click();
  await gym.getByTestId("EntryEditor-event").click();
  const added = page
    .getByTestId("EntryEditor-entry")
    .filter({ hasText: "New item" });
  await added.getByTestId("EntryEditor-open").click();
  await added.getByTestId("EntryEditor-title").fill("Evening walk");
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  const saved = (await (await request.get("/api/routine")).json()).routine;
  expect(
    saved.days.weekday.items.find((entry) =>
      entry.items?.some((item) => item.title === "Evening walk"),
    ),
  ).toEqual({
    when: { gym: false },
    items: [{ title: "Evening walk", duration: 5, time: "08:00" }],
  });
});
test("opens the correct alternative from a daily edit link and stays within narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/templates?t=weekday&edit=1.1");
  const work = page.getByRole("region", { name: "Work location", exact: true });
  await expect(
    work.getByRole("button", { name: "Office", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(work.getByTestId("EntryEditor-title").last()).toHaveValue(
    "Office work",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: "test-results/branches-editor-desktop.png",
    fullPage: true,
  });
});

test("keeps interleaved work alternatives in one section", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine = structuredClone(fixture);
  const items = routine.days.weekday.items;
  routine.days.weekday.items = [
    items[0],
    items[1],
    items[4],
    items[2],
    items[5],
    items[3],
    items[6],
  ];
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/templates?t=weekday");
  const work = page.getByRole("region", { name: "Work location", exact: true });
  await expect(work).toHaveCount(1);
  await expect(work.getByText("Work at home", { exact: true })).toBeVisible();
  await work.getByRole("button", { name: "Office", exact: true }).click();
  await expect(work.getByText("Commute", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Daily template", exact: true })
    .click();
  await expect(work).toHaveCount(1);
  await work.getByRole("button", { name: "Office", exact: true }).click();
  await expect(work.getByTestId("EntryEditor-open").first()).toContainText(
    "Commute",
  );
});

test("keeps times, circles and the rail aligned inside alternatives", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine = structuredClone(fixture);
  const office = routine.days.weekday.items[2];
  if ("items" in office) office.items.push({ use: "stretch", time: "09:30" });
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/templates?t=weekday");
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const option of ["Home", "Office"]) {
      await page
        .getByRole("region", { name: "Work location", exact: true })
        .getByRole("button", { name: option, exact: true })
        .click();
      const positions = await page
        .locator(".template-flow .timeline > .item")
        .evaluateAll((rows) =>
          rows.map((row) => {
            const time = row
              .querySelector(
                ":scope > .time, :scope > details > summary > .time",
              )!
              .getBoundingClientRect();
            const dot = row
              .querySelector(".dot, .gap-dot")!
              .getBoundingClientRect();
            return { timeRight: time.right, circleX: dot.x + dot.width / 2 };
          }),
        );
      expect(positions.length).toBeGreaterThan(3);
      for (const position of positions) {
        expect(
          Math.abs(position.timeRight - positions[0].timeRight),
        ).toBeLessThan(0.6);
        expect(Math.abs(position.circleX - positions[0].circleX)).toBeLessThan(
          0.6,
        );
      }
      const rail = await page.locator(".template-flow").evaluate((flow) => {
        const style = getComputedStyle(flow, "::before");
        return (
          flow.getBoundingClientRect().x +
          parseFloat(style.left) +
          parseFloat(style.width) / 2
        );
      });
      expect(Math.abs(rail - positions[0].circleX)).toBeLessThan(0.6);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/branches-aligned-mobile.png",
    fullPage: true,
  });
});

test("shows alternative defaults and availability in the timeline instead of a separate summary", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine = structuredClone(fixture);
  const choices = routine.days.weekday.choices!;
  choices.location.default = {
    mon: "home",
    tue: "office",
    wed: "home",
    thu: "home",
    fri: "home",
    sat: "home",
    sun: "home",
  };
  choices.location.options!.office.only_on = ["tue"];
  choices.gym.active_when = { location: "office" };
  const entries = routine.days.weekday.items;
  routine.days.weekday.items = [
    entries[0],
    entries[1],
    entries[2],
    entries[4],
    entries[5],
    entries[3],
    entries[6],
  ];
  expect(
    (
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/templates?t=weekday");
  await expect(
    page.getByRole("heading", { name: "Alternatives", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".alternatives-summary")).toHaveCount(0);
  const work = page.getByRole("region", { name: "Work location", exact: true });
  await expect(work.locator(":scope > .branch-details")).toHaveText(
    "Default Mon, Wed, Thu, Fri, Sat, Sun",
  );
  await work.getByRole("button", { name: "Office", exact: true }).click();
  await expect(work.locator(":scope > .branch-details")).toHaveText(
    "Default Tue · Available Tue",
  );
  await expect(
    page
      .getByRole("region", { name: "Gym", exact: true })
      .locator(".branch-applies"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit Daily template", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alternatives", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("ChoiceEditor")).toContainText("Work location");
});

test("nests child alternatives and keeps independent later alternatives separate", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine: Routine = {
    days: {
      day: {
        on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        choices: {
          location: {
            label: "Location",
            options: { office: { label: "Office" }, home: { label: "Home" } },
            default: "office",
          },
          evening: {
            label: "Evening",
            options: {
              dance: { label: "Dance" },
              workshop: { label: "Workshop" },
            },
            default: "dance",
            active_when: { location: "office" },
          },
          gym: {
            label: "Gym",
            type: "toggle",
            default: true,
            active_when: { location: "home" },
          },
          later: { label: "Going out", type: "toggle", default: true },
        },
        items: [
          { title: "Breakfast", time: "07:00", duration: 15 },
          {
            when: { location: "office" },
            items: [{ title: "Office work", time: "09:00", duration: 60 }],
          },
          {
            when: { evening: "dance" },
            items: [{ title: "Dance", time: "18:00", duration: 60 }],
          },
          {
            when: { evening: "workshop" },
            items: [{ title: "Workshop", time: "18:00", duration: 60 }],
          },
          {
            when: { location: "home" },
            items: [{ title: "Home work", time: "09:00", duration: 60 }],
          },
          {
            when: { gym: true },
            items: [{ title: "Lift", time: "18:00", duration: 60 }],
          },
          {
            when: { evening: { not: "workshop" } },
            items: [{ title: "Shared evening", time: "19:00", duration: 30 }],
          },
          { title: "Dinner", time: "20:00", duration: 30 },
          {
            when: { later: true },
            items: [{ title: "Go out", time: "21:00", duration: 30 }],
          },
          {
            when: { later: false },
            items: [{ title: "Stay home", time: "21:00", duration: 30 }],
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
  await page.goto("/templates?t=day");
  const location = page.getByRole("region", { name: "Location", exact: true });
  const evening = location.getByRole("region", {
    name: "Evening",
    exact: true,
  });
  await expect(evening).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Gym", exact: true }),
  ).toHaveCount(0);
  await evening.getByRole("button", { name: "Workshop", exact: true }).click();
  await expect(
    location.getByText("Shared evening", { exact: true }),
  ).toHaveCount(0);
  const later = page.getByRole("region", { name: "Going out", exact: true });
  await later.getByRole("button", { name: "Off", exact: true }).click();
  await expect(later.getByText("Stay home", { exact: true })).toBeVisible();
  await location.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    location.getByRole("region", { name: "Evening", exact: true }),
  ).toHaveCount(0);
  await expect(
    location.getByRole("region", { name: "Gym", exact: true }),
  ).toBeVisible();
  await expect(
    location.getByText("Shared evening", { exact: true }),
  ).toBeVisible();
  await expect(
    later.getByRole("button", { name: "Off", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    location.getByRole("region", { name: "Going out", exact: true }),
  ).toHaveCount(0);
  const centers = await page
    .locator(".template-flow .dot")
    .evaluateAll((dots) =>
      dots.map((dot) => {
        const rect = dot.getBoundingClientRect();
        return rect.x + rect.width / 2;
      }),
    );
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(0.6);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("branches follow their activities' start times without manual ordering controls", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/routine")).json();
  const routine = {
    days: {
      day: {
        on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        choices: { gym: { label: "Gym", type: "toggle", default: true } },
        items: [
          { title: "Morning", time: "07:00", duration: 15 },
          {
            when: { gym: true },
            items: [{ title: "Workout", time: "18:00", duration: 45 }],
          },
          { when: { gym: false }, items: [] },
          { title: "Dinner", time: "19:00", duration: 30 },
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
  await page.goto("/templates");
  await page.getByTestId("Templates-edit").click();
  const branch = page.getByRole("region", { name: "Gym", exact: true });
  await branch.getByTestId("EntryEditor-open").click();
  const time = branch.getByTestId("EntryEditor-time");
  await time.fill("06:00");
  await time.blur();
  const headings = page.locator(
    ".editor-timeline > .entries > .entry > summary .summary-title, .editor-timeline > .entries > .branch-section > .branch-heading > span",
  );
  await expect(headings).toHaveText(["Gym", "Morning", "Dinner"]);
  await expect(page.getByTestId("EntryEditor-up")).toHaveCount(0);
  await expect(page.getByTestId("EntryEditor-down")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Move branch/ })).toHaveCount(
    0,
  );
  await expect(branch.getByTestId("EntryEditor-time")).toHaveValue("06:00");
  await expect(branch.getByTestId("EntryEditor-time")).toBeVisible();
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  const saved = (await (await request.get("/api/routine")).json()).routine;
  expect(saved.days.day.items[0].when).toEqual({ gym: true });
  expect(saved.days.day.items[0].items[0].time).toBe("06:00");
});

test("simplified add controls and heading trash icons preserve unrelated entries", async ({
  page,
  request,
}) => {
  await edit(page);
  const timeline = page.locator(".editor-timeline > .entries");
  await expect(
    page.getByRole("combobox", { name: "Alternative for new branch" }),
  ).toHaveCount(0);
  await timeline
    .getByRole("button", { name: "+ Add branch", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("region", { name: "New branch", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete new branch", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "New branch", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("TemplateEditor-save")).toBeDisabled();

  const breakfast = page
    .getByTestId("EntryEditor-entry")
    .filter({ hasText: "Breakfast" });
  await expect(breakfast).not.toHaveAttribute("open", "");
  await breakfast
    .getByRole("button", { name: "Delete event Breakfast", exact: true })
    .click();
  await expect(breakfast).toHaveCount(0);
  await expect(
    page.getByTestId("EntryEditor-open").filter({ hasText: "Lunch" }),
  ).toBeVisible();

  const work = page.getByRole("region", { name: "Work location", exact: true });
  await work.getByTestId("EntryEditor-add").click();
  await expect(work.getByTestId("EntryEditor-event")).toBeVisible();
  await expect(work.getByTestId("EntryEditor-use")).toBeVisible();
  await work.getByTestId("EntryEditor-use").click();
  const stretch = work
    .getByTestId("EntryEditor-entry")
    .filter({ hasText: "Stretch" });
  await stretch
    .getByRole("button", { name: "Delete shared block Stretch", exact: true })
    .click();
  await expect(stretch).toHaveCount(0);
  const remove = work
    .locator(":scope > .branch-heading")
    .getByRole("button", { name: "Delete branch Work location", exact: true });
  await remove.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(work).toBeVisible();
  await remove.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(work).toHaveCount(0);
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  const saved = (await (await request.get("/api/routine")).json()).routine;
  expect(saved.blocks).toEqual(fixture.blocks);
  expect(saved.days.weekday.items).toEqual(
    fixture.days.weekday.items.filter((_, i) => ![0, 1, 2].includes(i)),
  );
});

for (const width of [390, 1440]) {
  test(`add item menus dismiss outside and with Escape at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await edit(page);
    const menu = page.locator(
      ".editor-timeline > .entries > .entry-add-controls > .add-item",
    );
    const trigger = menu.getByTestId("EntryEditor-add");
    await trigger.click();
    await expect(menu.getByTestId("EntryEditor-event")).toBeVisible();
    await menu.locator(".add-item-menu").click({ position: { x: 2, y: 2 } });
    await expect(menu).toHaveAttribute("open", "");
    const heading = page.getByRole("heading", {
      name: "Timeline",
      exact: true,
    });
    if (width === 390) await heading.tap();
    else await heading.click();
    await expect(menu).not.toHaveAttribute("open", "");

    await trigger.click();
    await menu.getByTestId("EntryEditor-event").focus();
    await page.keyboard.press("Escape");
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(trigger).toBeFocused();

    await trigger.click();
    const work = page.getByRole("region", {
      name: "Work location",
      exact: true,
    });
    await work.getByTestId("EntryEditor-add").click();
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(work.getByTestId("EntryEditor-use")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(work.getByTestId("EntryEditor-use")).toBeHidden();
    await expect(page.getByTestId("TemplateEditor-save")).toBeDisabled();
    expect((await (await request.get("/api/routine")).json()).routine).toEqual(
      fixture,
    );
  });
}
