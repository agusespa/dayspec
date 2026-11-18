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
          title: "Lift",
          time: "18:00",
          duration: 45,
          when: { gym: true, location: "office" },
        },
        { title: "Rest", time: "18:00", duration: 45, when: { gym: false } },
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
  await work.getByTestId("EntryEditor-use").click();
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
  expect(saved.days.weekday.items[1].items[0].title).toBe("Focus at home");
  expect(saved.days.weekday.items[2].items[0].title).toBe("Train to office");
  expect(saved.days.weekday.items[2].items.at(-1)).toEqual({
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
    .getByRole("combobox", { name: "Alternative for new branch" })
    .last()
    .selectOption("gym");
  await page
    .getByRole("button", { name: "+ Add branch", exact: true })
    .last()
    .click();
  const gym = page.getByRole("region", { name: "Gym", exact: true }).last();
  await gym.getByRole("button", { name: "Off", exact: true }).click();
  await expect(gym).toContainText("Continue routine");
  await gym.getByTestId("EntryEditor-add").click();
  await gym.getByTestId("EntryEditor-open").click();
  await gym.getByTestId("EntryEditor-title").fill("Evening walk");
  await page.getByTestId("TemplateEditor-save").click();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
  const saved = (await (await request.get("/api/routine")).json()).routine;
  expect(saved.days.weekday.items.at(-1)).toEqual({
    when: { gym: false },
    items: [{ title: "Evening walk", duration: 5, time: "08:00" }],
  });
});
test("opens the correct alternative from a daily edit link and stays within narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/templates?t=weekday&edit=2.1");
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
            title: "Office work",
            time: "09:00",
            duration: 60,
            when: { location: "office" },
          },
          {
            title: "Dance",
            time: "18:00",
            duration: 60,
            when: { evening: "dance" },
          },
          {
            title: "Workshop",
            time: "18:00",
            duration: 60,
            when: { evening: "workshop" },
          },
          {
            title: "Home work",
            time: "09:00",
            duration: 60,
            when: { location: "home" },
          },
          { title: "Lift", time: "18:00", duration: 60, when: { gym: true } },
          {
            title: "Shared evening",
            time: "19:00",
            duration: 30,
            when: { evening: { not: "workshop" } },
          },
          { title: "Dinner", time: "20:00", duration: 30 },
          {
            title: "Go out",
            time: "21:00",
            duration: 30,
            when: { later: true },
          },
          {
            title: "Stay home",
            time: "21:00",
            duration: 30,
            when: { later: false },
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
