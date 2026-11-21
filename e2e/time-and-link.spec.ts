import { expect, test } from "./test";

test("template activities require a start time and save one optional link", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/api/routine")).json();
  try {
    const activity = {
      title: "Read",
      time: "08:00",
      duration: 20,
      note: "Bring a book",
    };
    const routine = {
      settings: { automatic_swedish_holidays: false },
      templates: {
        daily: {
          on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          items: [activity],
        },
      },
    };
    const seeded = await request.put("/api/routine", {
      headers: { "If-Match": original.revision },
      data: { routine },
    });
    expect(seeded.ok()).toBeTruthy();
    const snapshot = await seeded.json();
    for (const item of [
      { title: "Read", duration: 20 },
      {
        ...activity,
        link: ["https://example.com/first", "https://example.com/second"],
      },
    ]) {
      const invalid = {
        ...routine,
        templates: { daily: { ...routine.templates.daily, items: [item] } },
      };
      expect(
        (
          await request.put("/api/routine", {
            headers: { "If-Match": snapshot.revision },
            data: { routine: invalid },
          })
        ).status(),
      ).toBe(422);
      expect(
        (await (await request.get("/api/routine")).json()).routine,
      ).toEqual(routine);
    }
    await page.goto("/templates");
    await page
      .getByTestId("Templates-row-daily")
      .getByTestId("Templates-edit")
      .click();
    await page.getByTestId("EntryEditor-open").click();
    const link = page.getByTestId("EntryEditor-link");
    await expect(link).toHaveAttribute("type", "url");
    await page.getByTestId("EntryEditor-time").fill("");
    await page.getByTestId("TemplateEditor-save").click();
    await expect(page.getByTestId("TemplateEditor-errors")).toContainText(
      "time",
    );
    expect((await (await request.get("/api/routine")).json()).routine).toEqual(
      routine,
    );
    await page.getByTestId("EntryEditor-time").fill("10:30");
    await link.fill("https://example.com/book");
    await page.getByTestId("TemplateEditor-save").click();
    await expect(page.getByTestId("TemplateEditor-status")).toHaveText(
      "All changes saved",
    );
    await page.getByTestId("TemplateEditor-back").click();
    expect(
      (await (await request.get("/api/routine")).json()).routine.templates.daily
        .items,
    ).toEqual([
      { ...activity, time: "10:30", link: "https://example.com/book" },
    ]);
    await page.goto("/");
    await page.getByTestId("TimelineItem-toggle").click();
    await expect(
      page.getByRole("link", { name: /example.com/ }),
    ).toHaveAttribute("href", "https://example.com/book");
    await expect(page.getByTestId("ItemDetails-range")).toHaveText(
      "10:30–10:50",
    );
    await page.goto("/templates");
    await page
      .getByTestId("Templates-row-daily")
      .getByTestId("Templates-edit")
      .click();
    await page.getByTestId("EntryEditor-open").click();
    await expect(link).toHaveValue("https://example.com/book");
    await link.fill("");
    await page.getByTestId("TemplateEditor-save").click();
    await expect(page.getByTestId("TemplateEditor-status")).toHaveText(
      "All changes saved",
    );
    await page.getByTestId("TemplateEditor-back").click();
    expect(
      (await (await request.get("/api/routine")).json()).routine.templates.daily
        .items,
    ).toEqual([{ ...activity, time: "10:30" }]);
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
