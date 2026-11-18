import { expect, test } from "@playwright/test";
test("Profile saves holiday preferences across devices and preserves settings on failure", async ({
  page,
  request,
  browser,
}) => {
  const original = await (await request.get("/api/routine")).json();
  const other = await browser.newContext();
  try {
    const result = await request.put("/api/routine", {
      headers: { "If-Match": original.revision },
      data: {
        routine: {
          settings: { holiday: "off" },
          days: {
            work: {
              on: ["mon", "tue", "wed", "thu", "fri"],
              items: [{ title: "Work day", duration: 5 }],
            },
            off: {
              on: ["sat", "sun"],
              items: [{ title: "Rest day", duration: 5 }],
            },
          },
        },
      },
    });
    expect(result.ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date("2026-12-25T09:00:00+01:00"));
    await page.goto("/");
    await page.getByTestId("Nav-profile").click();
    await expect(page.getByTestId("Profile-version")).toContainText(
      /Version dev\s*Built .*\d{4}/,
    );
    const setting = page.getByTestId("Profile-automatic-holidays");
    await expect(setting).toBeChecked();
    await expect(setting).toBeEnabled();
    await setting.uncheck();
    await expect(setting).toBeEnabled();
    await expect(setting).not.toBeChecked();
    await page.reload();
    await expect(setting).not.toBeChecked();
    expect(
      (await (await request.get("/api/routine")).json()).routine.settings
        .automatic_swedish_holidays,
    ).toBe(false);
    const phone = await other.newPage();
    await phone.clock.setFixedTime(new Date("2026-12-25T09:00:00+01:00"));
    await phone.goto(new URL("/", page.url()).href);
    await expect(phone.getByTestId("Day-holiday-toggle")).not.toBeChecked();
    await expect(phone.getByTestId("TimelineItem")).toContainText("Work day");
    await expect(phone.getByTestId("Day-holiday-source")).toHaveCount(0);
    await setting.check();
    await expect(setting).toBeEnabled();
    await phone.reload();
    await expect(phone.getByTestId("Day-holiday-toggle")).toBeChecked();
    await expect(phone.getByTestId("TimelineItem")).toContainText("Rest day");
    await page.route("**/api/routine", (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Could not save settings" }),
          })
        : route.continue(),
    );
    await setting.click();
    await expect(page.getByTestId("Profile-error")).toBeVisible();
    await expect(setting).toBeChecked();
    await expect(setting).toBeEnabled();
    expect(
      (await (await request.get("/api/routine")).json()).routine.settings
        .automatic_swedish_holidays,
    ).toBe(true);
  } finally {
    await other.close();
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
