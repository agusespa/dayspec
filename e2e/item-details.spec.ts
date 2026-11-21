import { expect, test } from "./test";
test("tapping an activity shows its time range, category, conditions and calendar link", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/api/routine")).json();
  try {
    const result = await request.put("/api/routine", {
      headers: { "If-Match": original.revision },
      data: {
        routine: {
          categories: { chores: { name: "Chores", color: "orange" } },
          blocks: {
            morning: {
              name: "Morning",
              category: "chores",
              items: [
                { title: "Make bed", duration: 5 },
                { title: "Tidy", duration: 10 },
              ],
            },
          },
          templates: {
            daily: {
              on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
              choices: {
                gym: {
                  label: "Gym",
                  options: { yes: { label: "Yes" }, no: { label: "No" } },
                  default: "yes",
                },
              },
              items: [
                { use: "morning", time: "07:00" },
                {
                  choice: "gym",
                  paths: {
                    yes: [
                      {
                        title: "Lift",
                        time: "09:00",
                        duration: 45,
                        approx: true,
                        alert: true,
                        category: "chores",
                      },
                    ],
                  },
                },
                { time: "10:00", title: "Later", duration: 5 },
              ],
            },
          },
        },
      },
    });
    expect(result.ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date("2026-11-18T06:00:00+01:00"));
    await page.goto("/");
    const lift = page.getByTestId("TimelineItem").filter({ hasText: "Lift" });
    await expect(lift.getByTestId("ItemDetails")).toHaveCount(0);
    await expect(lift.getByTestId("TimelineItem-toggle")).not.toContainText(
      "45 min",
    );
    await lift.getByTestId("TimelineItem-toggle").click();
    await expect(lift.getByTestId("ItemDetails-duration")).toHaveText("45 min");
    await expect(lift.locator(".facts .metadata > span").first()).toHaveText(
      "45 min",
    );
    await expect(lift.getByTestId("TimelineItem-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(lift.getByTestId("ItemDetails-range")).toHaveText(
      "≈09:00–09:45",
    );
    await expect(lift.getByTestId("ItemDetails-category")).toHaveText("Chores");
    await expect(lift.getByRole("img", { name: "Alert" })).toBeVisible();
    await expect(lift.getByTestId("ItemDetails-when")).toHaveCount(0);
    // The calendar link is an icon, named for screen readers.
    const calendar = lift.getByRole("link", {
      name: "Add Lift to Google Calendar",
    });
    await expect(calendar).toBeVisible();
    await expect(calendar).toHaveText("");
    await lift.getByTestId("TimelineItem-toggle").click();
    await expect(lift.getByTestId("ItemDetails")).toHaveCount(0);
    // Template activities show their required start and derived end time.
    const later = page.getByTestId("TimelineItem").filter({ hasText: "Later" });
    await later.getByTestId("TimelineItem-toggle").click();
    await expect(later.getByTestId("ItemDetails-duration")).toHaveText("5 min");
    await expect(later.getByTestId("ItemDetails-range")).toHaveText(
      "10:00–10:05",
    );
    // An open block shows its own range and category, and each activity opens on its own.
    const block = page.getByTestId("Timeline-block");
    await block.getByTestId("Timeline-block-toggle").click();
    await expect(block.getByTestId("Timeline-block-facts")).toContainText(
      "07:00–07:15",
    );
    await expect(block.getByTestId("Timeline-block-facts")).toContainText(
      "Chores",
    );
    await block.getByTestId("Timeline-block-entry-toggle").nth(1).click();
    await expect(block.getByTestId("ItemDetails-range")).toHaveText(
      "07:05–07:15",
    );
    await expect(block.getByTestId("ItemDetails-category")).toHaveText(
      "Chores",
    );
  } finally {
    const current = await (await request.get("/api/routine")).json();
    expect(
      (
        await request.put("/api/routine", {
          headers: { "If-Match": current.revision },
          data: { routine: original.routine },
        })
      ).ok(),
    ).toBeTruthy();
  }
});
test("an activity's edit link opens the editor at that activity and returns to Today", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/api/routine")).json();
  try {
    const result = await request.put("/api/routine", {
      headers: { "If-Match": original.revision },
      data: {
        routine: {
          blocks: {
            morning: {
              name: "Morning",
              items: [
                { title: "Make bed", duration: 5 },
                { title: "Tidy", duration: 10 },
              ],
            },
          },
          templates: {
            daily: {
              on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
              items: [
                { use: "morning", time: "07:00" },
                { title: "Read", time: "08:00", duration: 20 },
                { title: "Lift", time: "09:00", duration: 45 },
              ],
            },
          },
        },
      },
    });
    expect(result.ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date("2026-11-18T06:00:00+01:00"));
    await page.goto("/");
    const lift = page.getByTestId("TimelineItem").filter({ hasText: "Lift" });
    await lift.getByTestId("TimelineItem-toggle").click();
    await lift.getByRole("link", { name: "Edit Lift" }).click();
    await expect(page).toHaveURL(/\/templates\?t=daily&edit=2$/);
    const focused = page.locator("[data-focused]");
    await expect(focused).toHaveCount(1);
    await expect(focused).toHaveAttribute("open", "");
    await expect(focused.getByTestId("EntryEditor-title")).toHaveValue("Lift");
    await expect(focused.getByTestId("EntryEditor-title")).toBeInViewport();
    await page.getByTestId("TemplateEditor-back").click();
    await expect(page).toHaveURL(/\/$/);
    // Inside a shared block, the link opens the block at that activity.
    const block = page.getByTestId("Timeline-block");
    await block.getByTestId("Timeline-block-toggle").click();
    await block.getByTestId("Timeline-block-entry-toggle").nth(1).click();
    await block.getByRole("link", { name: "Edit Tidy" }).click();
    await expect(page).toHaveURL(/\/templates\?block=morning&edit=1$/);
    await expect(page.getByTestId("TemplateEditor-block-name")).toHaveValue(
      "Morning",
    );
    await expect(
      page.locator("[data-focused]").getByTestId("EntryEditor-title"),
    ).toHaveValue("Tidy");
    await page.getByTestId("TemplateEditor-back").click();
    // The block's own link opens the block.
    await page
      .getByTestId("Timeline-block")
      .getByTestId("Timeline-block-toggle")
      .click();
    await page.getByRole("link", { name: "Edit Morning" }).click();
    await expect(page).toHaveURL(/\/templates\?block=morning$/);
    await expect(page.getByTestId("TemplateEditor-block-name")).toHaveValue(
      "Morning",
    );
    await expect(page.locator("[data-focused]")).toHaveCount(0);
  } finally {
    const current = await (await request.get("/api/routine")).json();
    expect(
      (
        await request.put("/api/routine", {
          headers: { "If-Match": current.revision },
          data: { routine: original.routine },
        })
      ).ok(),
    ).toBeTruthy();
  }
});
for (const width of [390, 1440]) {
  test(`shared blocks show alerts from their activities when collapsed and expanded at ${width}px`, async ({
    page,
    request,
  }) => {
    const original = await (await request.get("/api/routine")).json();
    const routine = {
      blocks: {
        reminders: {
          name: "Reminders",
          items: [
            { title: "Take medication", duration: 5, alert: true },
            { title: "Drink water", duration: 5 },
          ],
        },
        morning: { name: "Morning", items: [{ use: "reminders" }] },
        quiet: { name: "Quiet time", items: [{ title: "Read", duration: 10 }] },
      },
      templates: {
        daily: {
          on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          items: [
            { use: "morning", time: "07:00" },
            { use: "quiet", time: "08:00" },
            { time: "08:00", use: "reminders" },
          ],
        },
      },
    };
    try {
      expect(
        (
          await request.put("/api/routine", {
            headers: { "If-Match": original.revision },
            data: { routine },
          })
        ).ok(),
      ).toBeTruthy();
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(new Date("2026-11-18T06:00:00+01:00"));
      await page.goto("/");
      const blocks = page.getByTestId("Timeline-block");
      await expect(blocks).toHaveCount(3);
      const quiet = blocks.filter({
        has: page
          .getByTestId("Timeline-block-toggle")
          .filter({ hasText: "Quiet time" }),
      });
      await expect(quiet.getByRole("img", { name: "Alert" })).toHaveCount(0);
      for (const name of ["Morning", "Reminders"]) {
        const block = blocks.filter({
          has: page
            .getByTestId("Timeline-block-toggle")
            .filter({ hasText: name }),
        });
        const summary = block.getByTestId("Timeline-block-toggle");
        await expect(summary.getByRole("img", { name: "Alert" })).toBeVisible();
        await summary.click();
        const medication = block
          .getByTestId("Timeline-block-entry")
          .filter({ hasText: "Take medication" });
        await expect(
          medication.getByRole("img", { name: "Alert" }),
        ).toBeVisible();
        await expect(
          block
            .getByTestId("Timeline-block-entry")
            .filter({ hasText: "Drink water" })
            .getByRole("img", { name: "Alert" }),
        ).toHaveCount(0);
        await expect(summary.getByRole("img", { name: "Alert" })).toBeVisible();
        await summary.click();
        await expect(summary.getByRole("img", { name: "Alert" })).toBeVisible();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // Removing the activity's alert also clears the inherited block indicator.
      routine.blocks.reminders.items[0].alert = false;
      const current = await (await request.get("/api/routine")).json();
      expect(
        (
          await request.put("/api/routine", {
            headers: { "If-Match": current.revision },
            data: { routine },
          })
        ).ok(),
      ).toBeTruthy();
      await page.reload();
      await expect(blocks).toHaveCount(3);
      await expect(page.getByRole("img", { name: "Alert" })).toHaveCount(0);
    } finally {
      const current = await (await request.get("/api/routine")).json();
      expect(
        (
          await request.put("/api/routine", {
            headers: { "If-Match": current.revision },
            data: { routine: original.routine },
          })
        ).ok(),
      ).toBeTruthy();
    }
  });
}
