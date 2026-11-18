import { expect, test, type Page } from "@playwright/test";
async function save(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/routine") && r.request().method() === "PUT",
  );
  await page.getByTestId("TemplateEditor-save").click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByTestId("Templates-saved")).toBeVisible();
}
test("edits choices, conditional activities, durations and Notion links, then selects a holiday template", async ({
  page,
  request,
  browser,
}) => {
  const original = await (await request.get("/api/routine")).json();
  try {
    const routine = {
      settings: { automatic_swedish_holidays: false },
      days: {
        work: { on: ["mon", "tue", "wed", "thu", "fri"], items: [] },
        rest: {
          on: ["sat", "sun"],
          items: [{ title: "Rest", time: "09:00", duration: 30 }],
        },
      },
    };
    expect(
      (
        await request.put("/api/routine", {
          headers: { "If-Match": original.revision },
          data: { routine },
        })
      ).ok(),
    ).toBeTruthy();
    await page.clock.setFixedTime(new Date("2026-11-16T08:00:00+01:00"));
    await page.goto("/templates");
    await page
      .getByTestId("Templates-row-work")
      .getByTestId("Templates-edit")
      .click();
    await page.getByTestId("ChoiceEditor-add").click();
    const choice = page.getByTestId("ChoiceEditor-choice");
    await choice.getByTestId("ChoiceEditor-open").click();
    await choice.getByTestId("ChoiceEditor-name").fill("Work location");
    await choice.getByTestId("ChoiceEditor-option-name").nth(0).fill("Home");
    await choice.getByTestId("ChoiceEditor-option-name").nth(1).fill("Office");
    await page.getByTestId("EntryEditor-add").click();
    const first = page.getByTestId("EntryEditor-entry").nth(0);
    await expect(first.getByTestId("EntryEditor-title")).toBeHidden();
    await first.getByTestId("EntryEditor-open").click();
    await first.getByTestId("EntryEditor-title").fill("Breakfast");
    await first.getByTestId("EntryEditor-duration").fill("15");
    await first
      .getByTestId("EntryEditor-link")
      .fill("https://www.notion.so/routine");
    await page.getByTestId("EntryEditor-add").click();
    const second = page.getByTestId("EntryEditor-entry").nth(1);
    await second.getByTestId("EntryEditor-open").click();
    await second.getByTestId("EntryEditor-title").fill("Commute");
    await second.getByTestId("EntryEditor-time").fill("08:15");
    await second.getByTestId("EntryEditor-duration").fill("20");
    await second.getByTestId("ConditionsEditor-open").click();
    await second.getByTestId("ConditionsEditor-option-option_2").check();
    await save(page);
    const persisted = (await (await request.get("/api/routine")).json())
      .routine;
    expect(persisted.days.work.choices.choice.options.option_2.label).toBe(
      "Office",
    );
    expect(persisted.days.work.items[1]).toMatchObject({
      duration: 20,
      time: "08:15",
      when: { choice: "option_2" },
    });
    expect(persisted.days.work.items[1]).not.toHaveProperty("end");
    await page.goto("/");
    await expect(page.getByTestId("TimelineItem")).toHaveCount(1);
    await page.getByTestId("Day-choice-choice-option_2").click();
    await expect(page.getByTestId("TimelineItem")).toHaveCount(2);
    await expect(page.getByTestId("TimelineItem").first()).toContainText(
      "15 min",
    );
    await page.getByTestId("TimelineItem").first().getByTestId("TimelineItem-toggle").click();
    await expect(
      page.getByTestId("TimelineItem").first().getByRole("link", { name: /www\.notion\.so/ }),
    ).toHaveAttribute("href", "https://www.notion.so/routine");
    await page.reload();
    await expect(page.getByTestId("TimelineItem")).toHaveCount(2);
    const other = await browser.newContext();
    try {
      const phone = await other.newPage();
      await phone.clock.setFixedTime(new Date("2026-11-16T08:00:00+01:00"));
      await phone.goto("/");
      await phone.getByTestId("Day-choice-choice-option_2").click();
      await expect(phone.getByTestId("TimelineItem")).toHaveCount(2);
    } finally {
      await other.close();
    }
    await page.goto("/profile");
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/routine") && r.request().method() === "PUT",
    );
    await page.getByTestId("Profile-holiday-template").selectOption("rest");
    expect((await response).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId("Profile-holiday-template")).toHaveValue(
      "rest",
    );
    await expect(
      page.getByTestId("Profile-automatic-holidays"),
    ).not.toBeChecked();
    await page.route("**/api/routine", (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Unavailable" }),
          })
        : route.continue(),
    );
    await page.getByTestId("Profile-holiday-template").selectOption("");
    await expect(page.getByTestId("Profile-error")).toBeVisible();
    await expect(page.getByTestId("Profile-holiday-template")).toHaveValue(
      "rest",
    );
    await page.unroute("**/api/routine");
    await page.goto("/");
    await page.getByTestId("Day-holiday-toggle").check();
    await expect(page.getByTestId("TimelineItem")).toHaveCount(1);
    await expect(page.getByTestId("TimelineItem")).toContainText("Rest");
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

test("refuses a missing block duration without replacing the saved block", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/api/routine")).json();
  try {
    const routine = {
      days: { daily: { on: ["mon"], items: [] } },
      blocks: {
        stable: { name: "Wake Up!", items: [{ title: "Wash", duration: 5 }] },
      },
    };
    expect(
      (
        await request.put("/api/routine", {
          headers: { "If-Match": original.revision },
          data: { routine },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto("/templates");
    await page.getByTestId("Templates-blocks").click();
    await page.getByTestId("TemplateEditor-block-stable").click();
    await page.getByTestId("EntryEditor-open").click();
    await page.getByTestId("EntryEditor-duration").fill("");
    await page.getByTestId("TemplateEditor-save").click();
    await expect(page.getByTestId("TemplateEditor-errors")).toContainText(
      "duration",
    );
    expect((await (await request.get("/api/routine")).json()).routine).toEqual(
      routine,
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("TemplateEditor-cancel").click();
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
