import { expect, test } from "@playwright/test";

test("Profile edits categories and the timeline uses their colours", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/api/routine")).json();
  try {
    const result = await request.put("/api/routine", {
      headers: { "If-Match": original.revision },
      data: {
        routine: {
          categories: {
            chores: { name: "Chores", color: "orange" },
            rest: { name: "Rest", color: "indigo" },
          },
          days: {
            daily: {
              on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
              items: [
                {
                  title: "Laundry",
                  time: "09:00",
                  duration: 30,
                  category: "chores",
                },
              ],
            },
          },
        },
      },
    });
    expect(result.ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date("2026-11-18T08:00:00+01:00"));
    await page.goto("/");
    const dotColour = () =>
      page
        .getByTestId("TimelineItem")
        .locator(".dot")
        .evaluate((dot) => getComputedStyle(dot).borderTopColor);
    const paletteColour = (name: string) =>
      page.evaluate(
        (v) =>
          getComputedStyle(document.documentElement).getPropertyValue(v).trim(),
        `--tone-${name}`,
      );
    const hex = (rgb: string) =>
      "#" +
      rgb
        .match(/\d+/g)!
        .slice(0, 3)
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("");
    expect(hex(await dotColour())).toBe(await paletteColour("orange"));

    await page.getByTestId("Nav-profile").click();
    const categories = page.getByTestId("Category");
    await expect(page.getByTestId("Category-open")).toHaveText([
      "Chores",
      "Rest",
    ]);

    // Recolour and rename; the change saves at once.
    await categories.first().getByTestId("Category-open").click();
    await expect(
      categories.first().getByTestId("Category-delete"),
    ).toBeDisabled();
    await expect(
      categories.first().getByTestId("Category-used-by"),
    ).toContainText("Used by Laundry");
    await categories.first().getByTestId("Category-color-teal").click();
    await expect(
      categories.first().getByTestId("Category-color-teal"),
    ).toBeChecked();
    const name = categories.first().getByTestId("Category-name");
    await name.fill("Housework");
    await name.press("Enter");
    await expect(categories.first().getByTestId("Category-open")).toHaveText(
      "Housework",
    );
    const saved = (await (await request.get("/api/routine")).json()).routine;
    expect(saved.categories.chores).toEqual({
      name: "Housework",
      color: "teal",
    });

    // An empty name is refused and the saved one comes back.
    await name.fill(" ");
    await name.press("Enter");
    await expect(page.getByTestId("Category-error")).toHaveText(
      "Enter a category name.",
    );
    await expect(categories.first().getByTestId("Category-name")).toHaveValue(
      "Housework",
    );

    // Add one, then delete it; unused categories can go.
    await page.getByTestId("Category-add").click();
    await expect(categories).toHaveCount(3);
    const added = categories.nth(2);
    await expect(added.getByTestId("Category-name")).toHaveValue(
      "New category",
    );
    // Orange is free again now that Housework is teal.
    await expect(added.getByTestId("Category-color-orange")).toBeChecked();
    await added.getByTestId("Category-delete").click();
    await expect(categories).toHaveCount(2);

    await page.getByTestId("Nav-daily").click();
    expect(hex(await dotColour())).toBe(await paletteColour("teal"));
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

test("a shared block's category colours the block and the activities that don't set their own", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/api/routine")).json();
  try {
    const result = await request.put("/api/routine", {
      headers: { "If-Match": original.revision },
      data: {
        routine: {
          categories: {
            health: { name: "Health", color: "green" },
            chores: { name: "Chores", color: "orange" },
          },
          blocks: {
            morning: {
              name: "Morning",
              items: [
                { title: "Stretch", duration: 10 },
                { title: "Make bed", duration: 5, category: "chores" },
              ],
            },
          },
          days: {
            daily: {
              on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
              items: [{ use: "morning", time: "07:00" }],
            },
          },
        },
      },
    });
    expect(result.ok()).toBeTruthy();
    const colourOf = (variable: string) =>
      page.evaluate((v) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${v})`;
        document.body.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      }, variable);
    const block = page.getByTestId("Timeline-block");
    const blockDot = () =>
      block
        .locator("summary .dot")
        .evaluate((dot) => getComputedStyle(dot).borderTopColor);
    const bullets = () =>
      block
        .getByTestId("Timeline-block-entry")
        .evaluateAll((items) =>
          items.map((item) => getComputedStyle(item, "::marker").color),
        );

    await page.clock.setFixedTime(new Date("2026-11-18T06:00:00+01:00"));
    await page.goto("/");
    expect(await blockDot()).toBe(await colourOf("--muted"));

    await page.getByTestId("Nav-templates").click();
    await page.getByTestId("Templates-blocks").click();
    await page.getByTestId("TemplateEditor-block-morning").click();
    await page
      .getByTestId("TemplateEditor-block-category")
      .selectOption("health");
    await page.getByTestId("EntryEditor-open").first().click();
    await expect(page.getByTestId("EntryEditor-category").first()).toHaveValue(
      "",
    );
    await expect(
      page
        .getByTestId("EntryEditor-category")
        .first()
        .locator("option")
        .first(),
    ).toHaveText("Same as block");
    await page.getByTestId("TemplateEditor-save").click();
    await expect(page.getByTestId("TemplateEditor-save")).toHaveCount(0);
    expect(
      (await (await request.get("/api/routine")).json()).routine.blocks.morning
        .category,
    ).toBe("health");

    await page.getByTestId("Nav-daily").click();
    expect(await blockDot()).toBe(await colourOf("--tone-green"));
    await block.getByTestId("Timeline-block-toggle").click();
    expect(await bullets()).toEqual([
      await colourOf("--tone-green"),
      await colourOf("--tone-orange"),
    ]);

    await page.getByTestId("Nav-profile").click();
    await page.getByTestId("Category-open").first().click();
    await expect(page.getByTestId("Category-delete").first()).toBeDisabled();
    await expect(page.getByTestId("Category-used-by").first()).toContainText(
      "Used by Morning",
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
