import { expect, test } from "./test";
import routine from "./fixtures/routine.json" with { type: "json" };

for (const path of ["/", "/templates", "/profile"]) {
  test(`page header stays visible on ${path}`, async ({ page }) => {
    await page.route("**/api/routine", (route) =>
      route.fulfill({ json: { routine, revision: '"headers"' } }),
    );
    await page.goto(path);
    const header = page.locator(".page-header");
    await expect(header).toBeVisible();
    const before = await header.boundingBox();
    // Ensure even a short Profile page can scroll, without changing the header layout.
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "2000px";
      document.querySelector("main")!.append(spacer);
      window.scrollTo(0, 400);
    });
    await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
    const after = (await header.boundingBox())!;
    expect(after.height).toBe(before!.height);
    await expect(header.locator("h1")).toBeInViewport();
    if (path === "/")
      await expect(page.getByTestId("Day-holiday-toggle")).toBeInViewport();
    // Timeline and library sections remain normal scrolling content.
    expect(
      await header.locator(".timeline, .template-list, .settings").count(),
    ).toBe(0);
  });
}

for (const width of [390, 1440]) {
  test(`block and template editors use the same sticky header at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/routine", (route) =>
      route.fulfill({ json: { routine, revision: '"editor-headers"' } }),
    );
    await page.goto("/templates");
    const header = page.locator(".page-header");
    for (const view of ["block", "template"]) {
      if (view === "block")
        await page.getByTestId("SharedBlocks-edit-wake_up").click();
      if (view === "template") {
        await page.getByTestId("TemplateEditor-back").click();
        await page.getByTestId("Templates-edit").first().click();
      }
      await expect(header.locator("h1")).toHaveText(
        view === "block" ? "Edit routine" : "Edit template",
      );
      await expect(
        page.getByTestId("TemplateEditor-back"),
      ).toHaveAccessibleName("Back to Templates");
      await expect(header.locator(".eyebrow")).toHaveCount(0);
      await page.evaluate(() => {
        const spacer = document.createElement("div");
        spacer.style.height = "2000px";
        document.querySelector(".template-editor")!.append(spacer);
        window.scrollTo(0, 400);
      });
      await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
      await expect(header.locator("h1")).toBeInViewport();
    }
  });
}
