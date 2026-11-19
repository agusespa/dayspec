import { expect, test } from "@playwright/test";
test("collapses shared blocks in Daily and template previews without losing their contents", async ({
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
                {
                  title: "Wash",
                  duration: 10,
                  note: "Vitamins",
                },
                { title: "Breakfast", duration: 20 },
              ],
            },
          },
          days: {
            daily: {
              on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
              items: [
                { use: "morning", time: "07:00" },
                { title: "Work", time: "09:00", duration: 5 },
              ],
            },
          },
        },
      },
    });
    expect(result.ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date("2026-11-17T07:05:00+01:00"));
    await page.goto("/");
    await expect(page.getByTestId("Day-holiday-source")).toHaveCount(0);
    await page.getByTestId("Day-holiday-toggle").check();
    await expect(page.getByTestId("Day-holiday-source")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("Day-holiday-toggle")).toBeChecked();
    await expect(page.getByTestId("Day-holiday-source")).toHaveCount(0);
    await page.getByTestId("Day-holiday-toggle").uncheck();
    const block = page.getByTestId("Timeline-block");
    await expect(block).toHaveCount(1);
    const toggle = block.getByTestId("Timeline-block-toggle");
    await expect(toggle).toContainText("Morning");
    await expect(toggle).not.toContainText("30 min");
    await expect(block.getByTestId("Timeline-block-total")).toBeHidden();
    await expect(page.getByTestId("Timeline-gap")).toHaveCount(1);
    await expect(page.getByTestId("Timeline-gap")).toContainText("07:30");
    await expect(page.getByTestId("Timeline-gap")).toContainText("90 min");
    const items = block.getByTestId("Timeline-block-entry");
    await expect(items.first()).toBeHidden();
    await toggle.click();
    await expect(block.getByTestId("Timeline-block-total")).toHaveText(
      "30 min",
    );
    await expect(block.getByTestId("Timeline-block-total")).toBeVisible();
    await expect(
      block.locator(".block-facts .metadata > span").first(),
    ).toHaveText("30 min");
    await expect(items.first()).toBeVisible();
    await expect(items.first()).toContainText("Wash");
    await expect(items.nth(1)).toContainText("Breakfast");
    await expect(
      items.nth(1).getByTestId("Timeline-block-entry-toggle"),
    ).not.toContainText("20 min");
    await expect(items.first().getByTestId("Activity-note")).toHaveCount(0);
    await items.first().getByTestId("Timeline-block-entry-toggle").click();
    await expect(items.first().getByTestId("Activity-note")).toHaveText(
      "Vitamins",
    );
    await expect(block.getByTestId("TimelineItem")).toHaveCount(0);
    await expect(toggle).toContainText("07:00");
    await expect(toggle).not.toContainText("07:30");
    await items.nth(1).getByTestId("Timeline-block-entry-toggle").click();
    await expect(items.nth(1).getByTestId("ItemDetails-duration")).toHaveText(
      "20 min",
    );
    await expect(items.nth(1).getByTestId("ItemDetails-range")).toHaveText(
      "07:10–07:30",
    );
    await toggle.click();
    await expect(items.first()).toBeHidden();
    await page.goto("/templates");
    await page
      .getByTestId("Templates-row-daily")
      .getByTestId("Templates-open")
      .click();
    await expect(
      block.getByTestId("Timeline-block-entry").first(),
    ).toBeHidden();
    await block.getByTestId("Timeline-block-toggle").click();
    await expect(
      block.getByTestId("Timeline-block-entry").first(),
    ).toBeVisible();
  } finally {
    const current = await (await request.get("/api/routine")).json();
    const restored = await request.put("/api/routine", {
      headers: { "If-Match": current.revision },
      data: { routine: original.routine },
    });
    expect(restored.ok()).toBeTruthy();
  }
});
