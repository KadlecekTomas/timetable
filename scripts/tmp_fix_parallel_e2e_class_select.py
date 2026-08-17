from pathlib import Path

path = Path("apps/web/e2e/subject-rotation-and-sports.spec.ts")
text = path.read_text()
old = '  await page.getByLabel("Třída").selectOption("class-6b");\n'
new = '''  const classSelect = page.getByLabel("Třída");
  const class6BValue = await classSelect.locator("option").evaluateAll((options) => {
    const match = options.find((option) =>
      option.textContent?.trim().startsWith("6.B"),
    );
    return match?.getAttribute("value") ?? null;
  });
  expect(class6BValue).not.toBeNull();
  await classSelect.selectOption(class6BValue!);
'''
if old not in text:
    raise SystemExit("target line not found")
path.write_text(text.replace(old, new, 1))
