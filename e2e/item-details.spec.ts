import { expect, test } from "@playwright/test";

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
          days: {
            daily: {
              on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
              choices: { gym: { label: "Gym", type: "toggle", default: true } },
              items: [
                { use: "morning", time: "07:00" },
                {
                  when: { gym: true },
                  items: [
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
                { title: "Later", duration: 5 },
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
    await lift.getByTestId("TimelineItem-toggle").click();
    await expect(lift.getByTestId("TimelineItem-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(lift.getByTestId("ItemDetails-range")).toHaveText(
      "≈09:00–09:45",
    );
    await expect(lift.getByTestId("ItemDetails-category")).toHaveText("Chores");
    await expect(lift.getByRole("img", { name: "Alert" })).toBeVisible();
    await expect(lift.getByTestId("ItemDetails-when")).toHaveText(
      "When Gym on",
    );
    // The calendar link is an icon, named for screen readers.
    const calendar = lift.getByRole("link", {
      name: "Add Lift to Google Calendar",
    });
    await expect(calendar).toBeVisible();
    await expect(calendar).toHaveText("");
    await lift.getByTestId("TimelineItem-toggle").click();
    await expect(lift.getByTestId("ItemDetails")).toHaveCount(0);

    // An untimed activity with nothing else to show doesn't open.
    await expect(
      page
        .getByTestId("TimelineItem")
        .filter({ hasText: "Later" })
        .getByTestId("TimelineItem-toggle"),
    ).toHaveCount(0);

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
          days: {
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
    await page.getByTestId("TemplateEditor-cancel").click();
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
    await page.getByTestId("TemplateEditor-cancel").click();

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
