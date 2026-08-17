import { expect, test } from "@playwright/test";

test("save action stays fixed for long teacher labels and saved state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/staffing?schoolYearId=local-school-year");
  await page.getByRole("button", { name: "Přidat učitele ručně" }).click();

  await page
    .getByLabel("Jméno")
    .fill("Alexandra-Konstantina-Magdaléna-Mimořádně-Dlouhé-Jméno");
  await page
    .getByLabel("Příjmení")
    .fill("NejdelšíPříjmeníKteréNesmíRozbítHlavičkuKartyUčitele");

  const card = page.locator('[data-testid^="teacher-card-"]').first();
  const save = card.getByRole("button", { name: /^Uložit / });
  const longDirtyBox = await save.boundingBox();
  expect(longDirtyBox).not.toBeNull();

  await save.click();
  await expect(save).toContainText("Uloženo");
  const longSavedBox = await save.boundingBox();
  expect(longSavedBox).not.toBeNull();

  await page.getByLabel("Jméno").fill("A");
  await page.getByLabel("Příjmení").fill("B");
  await expect(save).toContainText("Uložit");
  const shortDirtyBox = await save.boundingBox();
  expect(shortDirtyBox).not.toBeNull();

  for (const box of [longSavedBox!, shortDirtyBox!]) {
    expect(Math.abs(box.x - longDirtyBox!.x)).toBeLessThan(1);
    expect(Math.abs(box.y - longDirtyBox!.y)).toBeLessThan(1);
    expect(Math.abs(box.width - longDirtyBox!.width)).toBeLessThan(1);
  }
});
