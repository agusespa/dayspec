import { expect, test } from "./test";
for (const width of [390, 1440]) {
  test(`delete confirmations use app dialogs and preserve cancelled changes at ${width}px`, async ({
    page,
    request,
    browserName,
  }) => {
    const original = await (await request.get("/api/routine")).json();
    const routine = {
      blocks: {
        spare: {
          name: "Spare block",
          items: [{ title: "Read", duration: 10 }],
        },
      },
      templates: {
        daily: {
          on: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          choices: {
            gym: {
              label: "Gym",
              options: { yes: { label: "Yes" }, no: { label: "No" } },
              default: "yes",
            },
          },
          items: [
            { title: "Breakfast", time: "07:00", duration: 15 },
            {
              choice: "gym",
              paths: {
                yes: [{ title: "Workout", time: "08:00", duration: 30 }],
                no: [],
              },
            },
          ],
        },
      },
    };
    const nativeDialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      nativeDialogs.push(dialog.type());
      await dialog.dismiss();
    });
    try {
      expect(
        (
          await request.put("/api/routine", {
            headers: { "If-Match": original.revision },
            data: { routine },
          })
        ).ok(),
      ).toBeTruthy();
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/templates");
      const removeTemplate = page.getByTestId("Templates-delete");
      await removeTemplate.click();
      const templateDialog = page.getByRole("dialog", {
        name: "Delete Daily template?",
        exact: true,
      });
      await expect(templateDialog).toBeVisible();
      await expect(
        templateDialog.getByRole("button", { name: "Cancel", exact: true }),
      ).toBeFocused();
      // Safari on macOS uses Option-Tab to include buttons in keyboard navigation.
      await page.keyboard.press(
        browserName === "webkit" && process.platform === "darwin"
          ? "Alt+Tab"
          : "Tab",
      );
      await expect(
        templateDialog.getByRole("button", { name: "Delete", exact: true }),
      ).toBeFocused();
      const bounds = await templateDialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: `test-results/delete-dialog-${width}.png`,
      });
      await page.keyboard.press("Escape");
      await expect(templateDialog).toHaveCount(0);
      await expect(removeTemplate).toBeFocused();
      expect(
        (await (await request.get("/api/routine")).json()).routine,
      ).toEqual(routine);
      const removeBlock = page.getByRole("button", {
        name: "Delete routine Spare block",
        exact: true,
      });
      await removeBlock.click();
      const blockDialog = page.getByRole("dialog", {
        name: "Delete routine?",
        exact: true,
      });
      await expect(blockDialog).toContainText("Spare block");
      await expect(
        blockDialog.getByRole("button", { name: "Cancel", exact: true }),
      ).toBeFocused();
      await blockDialog
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(removeBlock).toBeFocused();
      expect(
        (await (await request.get("/api/routine")).json()).routine,
      ).toEqual(routine);
      await removeBlock.click();
      await blockDialog
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await expect(removeBlock).toHaveCount(0);
      await page.getByTestId("Templates-edit").click();
      const branch = page.getByRole("region", { name: "Gym", exact: true });
      const removeBranch = branch.getByRole("button", {
        name: "Delete branch Gym",
        exact: true,
      });
      await removeBranch.click();
      const branchDialog = page.getByRole("dialog", {
        name: "Delete branch?",
        exact: true,
      });
      await expect(branchDialog).toContainText("Gym");
      await expect(
        branchDialog.getByRole("button", { name: "Cancel", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(removeBranch).toBeFocused();
      await expect(branch).toBeVisible();
      await expect(page.getByTestId("TemplateEditor-save")).toBeDisabled();
      await removeBranch.click();
      await branchDialog
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await expect(branch).toHaveCount(0);
      // A branch deletion is still a draft until the template is saved.
      expect(
        (await (await request.get("/api/routine")).json()).routine.templates
          .daily.items,
      ).toEqual(routine.templates.daily.items);
      await page.getByTestId("TemplateEditor-save").click();
      await expect(page.getByTestId("TemplateEditor-status")).toHaveText(
        "All changes saved",
      );
      await page.getByTestId("TemplateEditor-back").click();
      expect(
        (await (await request.get("/api/routine")).json()).routine.templates
          .daily.items,
      ).toEqual([routine.templates.daily.items[0]]);
      expect(nativeDialogs).toEqual([]);
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
}
