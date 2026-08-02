from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    content = target.read_text()
    if old not in content:
        raise SystemExit(f"Expected selector not found in {path}: {old!r}")
    target.write_text(content.replace(old, new, 1))


replace_once(
    "apps/web/e2e/subject-rotation-and-sports.spec.ts",
    '''  await expect(
    page.getByRole("button", { name: "Dvě skupiny – výměna předmětů" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Hned po sobě" }),
  ).toHaveAttribute("aria-pressed", "true");''',
    '''  const rotationCard = page.getByTestId("teaching-row-0");
  await expect(
    rotationCard.getByRole("button", {
      name: "Dvě skupiny – výměna předmětů",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    rotationCard.getByRole("button", { name: "Hned po sobě", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");''',
)

replace_once(
    "apps/web/e2e/teaching-plan.spec.ts",
    '''  await page.getByRole("button", { name: "Dvě skupiny" }).nth(1).click();''',
    '''  await page
    .getByTestId("teaching-row-1")
    .getByRole("button", { name: "Dvě skupiny", exact: true })
    .click();''',
)

replace_once(
    "apps/web/e2e/teaching-plan-import-review.spec.ts",
    '''    .getByRole("button", { name: "Dělení a dvojhodiny souhlasí" })''',
    '''    .getByRole("button", {
      name: "Dělení, dvojhodiny a výměny souhlasí",
      exact: true,
    })''',
)
