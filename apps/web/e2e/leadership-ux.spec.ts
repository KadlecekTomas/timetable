import { expect, test, type Page } from "@playwright/test";

const schoolYearContext = "schoolYearId=local-school-year";

const primaryRoutes = [
  "/",
  `/staffing?${schoolYearContext}`,
  `/coverage?${schoolYearContext}`,
  `/teaching-plan?${schoolYearContext}`,
  `/generate?${schoolYearContext}`,
  `/timetable?${schoolYearContext}`,
  `/settings?${schoolYearContext}`,
];

async function expectNoUnnamedControls(page: Page) {
  const unnamedButtons = await page
    .locator("button:visible")
    .evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const ownLabel = button.getAttribute("aria-label")?.trim();
          const title = button.getAttribute("title")?.trim();
          const text = button.textContent?.trim();
          const childLabel = button
            .querySelector("[aria-label]")
            ?.getAttribute("aria-label")
            ?.trim();
          return !ownLabel && !title && !text && !childLabel;
        })
        .map((button) => button.outerHTML),
    );

  expect(
    unnamedButtons,
    "Každé viditelné tlačítko musí mít srozumitelný název",
  ).toEqual([]);
}

async function expectNoPlaceholderLinks(page: Page) {
  const placeholderLinks = await page
    .locator("a:visible")
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href")?.trim() ?? "")
        .filter(
          (href) =>
            !href ||
            href === "#" ||
            href.toLowerCase().startsWith("javascript:"),
        ),
    );

  expect(
    placeholderLinks,
    "Viditelné odkazy nesmí končit na prázdném cíli",
  ).toEqual([]);
}

test("leadership workflow has working navigation and no blind controls", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByText("Tomáš Kadleček")).toHaveCount(0);

  const navigation = page.getByRole("navigation", { name: "Hlavní navigace" });
  await expect(navigation.getByRole("link")).toHaveCount(6);
  await expect(
    navigation.getByRole("link", { name: "3. Výukový plán" }),
  ).toHaveAttribute("href", /\/teaching-plan\?/);
  await expect(
    page.getByRole("link", { name: "Nastavení a záloha" }).first(),
  ).toHaveAttribute("href", /\/settings\?/);

  for (const route of primaryRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} musí být dostupná`).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText("Application error")).toHaveCount(0);
    await expectNoUnnamedControls(page);
    await expectNoPlaceholderLinks(page);
  }

  expect(pageErrors, "Hlavní průchod nesmí vyvolat pageerror").toEqual([]);
});

test("empty timetable state leads back to generation", async ({ page }) => {
  await page.goto(`/timetable?${schoolYearContext}`);

  await expect(
    page.getByRole("heading", { name: "Zatím není dostupný návrh rozvrhu" }),
  ).toBeVisible();
  const generationLink = page.getByRole("link", {
    name: "Přejít k tvorbě rozvrhu",
  });
  await expect(generationLink).toHaveAttribute("href", /\/generate\?/);

  await generationLink.click();
  await expect(page).toHaveURL(/\/generate\?schoolYearId=local-school-year$/);
  await expect(
    page.getByRole("heading", { name: "Tvorba rozvrhu" }),
  ).toBeVisible();
});

test("backup and settings stay reachable on a phone-sized screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const settingsLink = page
    .getByRole("link", { name: "Nastavení a záloha" })
    .first();
  await expect(settingsLink).toBeVisible();
  await settingsLink.click();

  await expect(page).toHaveURL(/\/settings\?schoolYearId=local-school-year$/);
  await expect(
    page.getByRole("heading", { name: "Lokální projekt školy" }),
  ).toBeVisible();
});
