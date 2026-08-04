from pathlib import Path

path = Path("apps/web/e2e/staffing.spec.ts")
text = path.read_text()
text = text.replace(
    '''  await expect(
    page.getByText(/Úvazek musí být celé číslo od 0 do 22 hodin/),
  ).toBeVisible();
''',
    '''  await expect(
    page.getByText("Úvazek musí být celé číslo od 0 do 22 hodin.", {
      exact: true,
    }),
  ).toBeVisible();
''',
    1,
)
path.write_text(text)
