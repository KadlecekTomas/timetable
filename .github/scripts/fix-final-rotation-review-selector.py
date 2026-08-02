from pathlib import Path

path = Path("apps/web/e2e/subject-rotation-and-sports.spec.ts")
content = path.read_text()
old = '  await expect(page.getByText(/Hned po sobě/)).toBeVisible();'
new = '''  await expect(
    page.getByText("Výměna · Hned po sobě", { exact: true }),
  ).toBeVisible();'''
if old not in content:
    raise SystemExit("Final rotation review selector was not found")
path.write_text(content.replace(old, new, 1))
