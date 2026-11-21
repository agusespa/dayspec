import { expect, test } from "./test";

for (const width of [320, 390]) {
  test(`long timeline names stay compact and expand at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const original = await (await request.get("/api/routine")).json();
    const name =
      "A very long activity name that should remain readable when expanded on a small phone";
    try {
      const response = await request.put("/api/routine", {
        headers: { "If-Match": original.revision },
        data: {
          routine: {
            blocks: {
              morning: {
                name,
                items: [{ title: name, duration: 15, note: "Details" }],
              },
            },
            templates: {
              daily: {
                on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                items: [
                  { title: name, time: "08:00", duration: 30, alert: true },
                  { use: "morning", time: "09:00" },
                ],
              },
            },
          },
        },
      });
      expect(response.ok()).toBeTruthy();
      await page.goto("/");
      const activity = page.getByTestId("TimelineItem-toggle");
      const block = page.getByTestId("Timeline-block-toggle");
      for (const row of [activity, block]) {
        const title = row.locator(".title-text");
        await expect(title).toHaveText(name);
        await expect(title).toHaveCSS("text-overflow", "ellipsis");
        expect(
          await title.evaluate((el) => el.scrollWidth > el.clientWidth),
        ).toBe(true);
        const chevron = await row.locator(".chevron").boundingBox();
        expect(chevron!.x + chevron!.width).toBeLessThanOrEqual(width);
        await expect(row.locator(".duration")).toHaveCount(0);
        const collapsed = (await title.boundingBox())!.height;
        await row.click();
        await expect(title).toHaveCSS("white-space", "normal");
        expect((await title.boundingBox())!.height).toBeGreaterThan(collapsed);
      }
      const child = page.getByTestId("Timeline-block-entry-toggle");
      await expect(child.locator(".contents-title")).toHaveCSS(
        "text-overflow",
        "ellipsis",
      );
      await child.click();
      await expect(child.locator(".contents-title")).toHaveCSS(
        "white-space",
        "normal",
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
    } finally {
      const current = await (await request.get("/api/routine")).json();
      await request.put("/api/routine", {
        headers: { "If-Match": current.revision },
        data: { routine: original.routine },
      });
    }
  });
}
