import { expect, test } from "./test";
for (const width of [320, 390, 1440]) {
  test(`shared blocks show a compact timed timeline in Daily and template previews at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
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
            templates: {
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
      await expect(block.getByTestId("Timeline-block-entry-start")).toHaveText([
        "07:00",
        "07:10",
      ]);
      // Compact rows keep their clock, small dot and title on the same baseline.
      for (const item of await items.all()) {
        const time = (await item
          .getByTestId("Timeline-block-entry-start")
          .boundingBox())!;
        const dot = (await item.locator(".contents-dot").boundingBox())!;
        const title = (await item.locator(".contents-title").boundingBox())!;
        expect(
          Math.abs(time.y + time.height / 2 - dot.y - dot.height / 2),
        ).toBeLessThan(1);
        expect(
          Math.abs(title.y + title.height / 2 - dot.y - dot.height / 2),
        ).toBeLessThan(1);
        expect(dot.x - time.x - time.width).toBeLessThan(10);
        expect((await item.boundingBox())!.height).toBeLessThanOrEqual(30);
      }
      await page.screenshot({
        path: `test-results/shared-block-timeline-${width}.png`,
      });
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
      const note = (await items
        .first()
        .getByTestId("Activity-note")
        .boundingBox())!;
      const title = (await items
        .first()
        .locator(".contents-title")
        .boundingBox())!;
      expect(Math.abs(note.x - title.x)).toBeLessThan(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
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
      await expect(block.getByTestId("Timeline-block-entry-start")).toHaveText([
        "07:00",
        "07:10",
      ]);
      expect(
        (await (await request.get("/api/routine")).json()).routine,
      ).toEqual((await result.json()).routine);
    } finally {
      const current = await (await request.get("/api/routine")).json();
      const restored = await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine: original.routine },
      });
      expect(restored.ok()).toBeTruthy();
    }
  });
}
