import { expect, test } from "./test";
test("saves weekday defaults for all choices while keeping daily overrides", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/api/routine")).json();
  try {
    const routine = {
      settings: { automatic_swedish_holidays: false },
      templates: {
        work: {
          on: ["mon", "tue", "wed", "thu", "fri"],
          items: [
            { choice: "place", paths: {} },
            { choice: "outing", paths: {} },
            { choice: "exercise", paths: {} },
          ],
          choices: {
            place: {
              label: "Work location",
              options: { office: { label: "Office" }, home: { label: "Home" } },
              default: "office",
            },
            outing: {
              label: "Going out",
              options: {
                staying: { label: "Staying in" },
                out: { label: "Going out" },
              },
              default: "staying",
            },
            exercise: {
              label: "Exercise",
              options: { yes: { label: "Yes" }, no: { label: "No" } },
              default: "no",
            },
          },
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
    await page.clock.setFixedTime(new Date("2026-11-18T12:00:00+01:00"));
    await page.goto("/templates");
    await page
      .getByTestId("Templates-row-work")
      .getByTestId("Templates-edit")
      .click();
    for (const name of ["place", "outing", "exercise"]) {
      const editor = page.getByTestId(`ChoiceEditor-${name}`);
      await editor.getByTestId("ChoiceEditor-open").click();
      await expect(editor.getByTestId("ChoiceEditor-default-mode")).toHaveValue(
        "same",
      );
      await editor
        .getByTestId("ChoiceEditor-default-mode")
        .selectOption("weekday");
      await expect(editor.getByTestId("ChoiceEditor-default")).toHaveCount(5);
    }
    const place = page.getByTestId("ChoiceEditor-place");
    await place
      .getByLabel("Default · Wed", { exact: true })
      .selectOption("home");
    await place
      .getByLabel("Default · Fri", { exact: true })
      .selectOption("home");
    await page
      .getByTestId("ChoiceEditor-outing")
      .getByLabel("Default · Fri", { exact: true })
      .selectOption("out");
    await page
      .getByTestId("ChoiceEditor-exercise")
      .getByLabel("Default · Wed", { exact: true })
      .selectOption("yes");
    await page.getByTestId("TemplateEditor-save").click();
    await expect(page.getByTestId("TemplateEditor-status")).toHaveText(
      "All changes saved",
    );
    await page.getByTestId("TemplateEditor-back").click();
    const saved = (await (await request.get("/api/routine")).json()).routine
      .templates.work.choices;
    expect(saved.place.default).toEqual({
      mon: "office",
      tue: "office",
      wed: "home",
      thu: "office",
      fri: "home",
    });
    expect(saved.outing.default).toEqual({
      mon: "staying",
      tue: "staying",
      wed: "staying",
      thu: "staying",
      fri: "out",
    });
    expect(saved.exercise.default).toEqual({
      mon: "no",
      tue: "no",
      wed: "yes",
      thu: "no",
      fri: "no",
    });
    await page.reload();
    await page
      .getByTestId("Templates-row-work")
      .getByTestId("Templates-edit")
      .click();
    await page
      .getByTestId("ChoiceEditor-place")
      .getByTestId("ChoiceEditor-open")
      .click();
    await expect(
      page
        .getByTestId("ChoiceEditor-place")
        .getByTestId("ChoiceEditor-default-mode"),
    ).toHaveValue("weekday");
    await expect(
      page
        .getByTestId("ChoiceEditor-place")
        .getByLabel("Default · Wed", { exact: true }),
    ).toHaveValue("home");
    await page.getByTestId("TemplateEditor-back").click();
    await page.goto("/");
    await expect(page.getByTestId("Day-choice-place")).toHaveValue("home");
    await expect(page.getByTestId("Day-choice-exercise")).toHaveValue("yes");
    await page.getByTestId("Day-choice-place").selectOption("office");
    await page.reload();
    await expect(page.getByTestId("Day-choice-place")).toHaveValue("office");
    await page.clock.setFixedTime(new Date("2026-11-20T12:00:00+01:00"));
    await page.reload();
    await expect(page.getByTestId("Day-choice-place")).toHaveValue("home");
    await expect(page.getByTestId("Day-choice-outing")).toHaveValue("out");
    await expect(page.getByTestId("Day-choice-exercise")).toHaveValue("no");
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
test("Saturday offers named evening options in the daily view and editor", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/api/routine")).json();
  try {
    const routine = {
      settings: { automatic_swedish_holidays: false },
      templates: {
        saturday: {
          on: ["sat"],
          choices: {
            evening: {
              label: "Evening",
              options: {
                stay_home: { label: "Stay home" },
                going_out: { label: "Going out" },
              },
              default: "stay_home",
            },
          },
          items: [
            { title: "Dinner", time: "19:00", duration: 30 },
            {
              choice: "evening",
              paths: {
                going_out: [
                  { title: "Get ready to go out", time: "18:30", duration: 30 },
                ],
              },
            },
          ],
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
    await page.clock.setFixedTime(new Date("2026-11-21T12:00:00+01:00"));
    await page.goto("/");
    const evening = page.getByTestId("Day-choice-evening");
    await expect(evening).toHaveValue("stay_home");
    await expect(evening.locator("option:checked")).toHaveText("Stay home");
    await expect(
      page.getByText("Get ready to go out", { exact: true }),
    ).toHaveCount(0);
    await evening.selectOption({ label: "Going out" });
    await expect(
      page.getByText("Get ready to go out", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Dinner", { exact: true })).toBeVisible();
    await page.reload();
    await expect(evening).toHaveValue("going_out");
    await page.goto("/templates");
    await page
      .getByTestId("Templates-row-saturday")
      .getByTestId("Templates-edit")
      .click();
    const editor = page.getByTestId("ChoiceEditor-evening");
    await editor.getByTestId("ChoiceEditor-open").click();
    await expect(editor.getByTestId("ChoiceEditor-type")).toHaveCount(0);
    expect(
      await editor
        .getByTestId("ChoiceEditor-option-name")
        .evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).value),
        ),
    ).toEqual(["Stay home", "Going out"]);
    await editor.getByTestId("ChoiceEditor-default").selectOption("going_out");
    await page.getByTestId("TemplateEditor-save").click();
    await expect(page.getByTestId("TemplateEditor-status")).toHaveText(
      "All changes saved",
    );
    await page.getByTestId("TemplateEditor-back").click();
    const saved = (await (await request.get("/api/routine")).json()).routine;
    expect(saved.templates.saturday.choices.evening).not.toHaveProperty("type");
    expect(saved.templates.saturday.choices.evening.default).toBe("going_out");
    expect(saved.templates.saturday.items).toEqual(
      [...routine.templates.saturday.items].reverse(),
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

test("holiday templates keep their own daily selections across toggles and reloads", async ({
  page,
}) => {
  const choice = { options: { option: {}, option_2: {} }, default: "option" };
  const routine = {
    settings: { holiday_template: "rest", automatic_swedish_holidays: false },
    templates: {
      work: {
        on: ["mon"],
        choices: { choice },
        items: [
          {
            choice: "choice",
            paths: {
              option: [{ title: "Office", time: "08:00", duration: 30 }],
              option_2: [{ title: "WFH", time: "08:00", duration: 30 }],
            },
          },
        ],
      },
      rest: {
        on: ["sun"],
        choices: { choice },
        items: [
          {
            choice: "choice",
            paths: {
              option: [{ title: "Stay home", time: "18:00", duration: 30 }],
              option_2: [{ title: "Go out", time: "18:00", duration: 30 }],
            },
          },
        ],
      },
    },
  };
  await page.route("**/api/routine", (route) =>
    route.fulfill({ json: { routine, revision: '"template-scopes"' } }),
  );
  await page.clock.setFixedTime(new Date("2026-11-16T12:00:00+01:00"));
  await page.goto("/");
  const daySelect = page.getByTestId("Day-choice-choice");
  const holiday = page.getByTestId("Day-holiday-toggle");
  await daySelect.selectOption("option_2");
  await expect(page.getByTestId("TimelineItem-toggle")).toHaveText(["WFH"]);
  await holiday.check();
  await expect(daySelect).toHaveValue("option");
  await expect(page.getByTestId("TimelineItem-toggle")).toHaveText([
    "Stay home",
  ]);
  await daySelect.selectOption("option_2");
  await holiday.uncheck();
  await expect(daySelect).toHaveValue("option_2");
  await expect(page.getByTestId("TimelineItem-toggle")).toHaveText(["WFH"]);
  await page.reload();
  await expect(page.getByTestId("TimelineItem-toggle")).toHaveText(["WFH"]);
  await holiday.check();
  await expect(page.getByTestId("TimelineItem-toggle")).toHaveText(["Go out"]);
});
