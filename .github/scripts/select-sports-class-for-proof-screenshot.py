from pathlib import Path

path = Path("apps/web/e2e/subject-rotation-and-sports.spec.ts")
content = path.read_text()
old = '''  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();
  await capture(page, "14-vygenerovana-vymena-cj-m-ve-sportovni-6b.png");'''
new = '''  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();
  await page.getByLabel("Třída").selectOption({ label: "6.B · 6.B" });
  await expect(page.getByLabel("Třída")).toHaveValue(/.+/);
  await capture(page, "14-vygenerovana-vymena-cj-m-ve-sportovni-6b.png");'''
if old not in content:
    raise SystemExit("Timetable screenshot marker not found")
path.write_text(content.replace(old, new, 1))
