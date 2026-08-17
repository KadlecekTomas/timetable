from pathlib import Path

page = Path("apps/web/app/timetable/page.tsx")
text = page.read_text()
old = '''                <p className="mt-1 text-sm text-text-secondary">\n                  {selectedLesson.subject?.name} ·{" "}\n                  {selectedLesson.schoolClasses\n                    ?.map((item) => item.code)\n                    .join(" + ") ?? selectedLesson.schoolClass?.code}{" "}\n                  · {selectedLesson.teacher?.code}\n                </p>\n'''
new = '''                <p className="mt-1 text-sm text-text-secondary">\n                  {selectedLesson.subject?.name} ·{" "}\n                  {selectedLesson.schoolClasses\n                    ?.map((item) => item.code)\n                    .join(" + ") ?? selectedLesson.schoolClass?.code}\n                </p>\n                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">\n                  <span className="text-text-muted">Vyučující</span>\n                  <strong className="text-text-primary">\n                    {selectedLesson.teacher?.name ??\n                      selectedLesson.teacher?.code ??\n                      "neuveden"}\n                  </strong>\n                  {selectedLesson.teacher?.name &&\n                  selectedLesson.teacher?.code ? (\n                    <span className="font-mono text-xs text-text-muted">\n                      {selectedLesson.teacher.code}\n                    </span>\n                  ) : null}\n                </div>\n'''
if old not in text:
    raise SystemExit("timetable detail target not found")
page.write_text(text.replace(old, new, 1))

spec = Path("apps/web/e2e/subject-rotation-and-sports.spec.ts")
text = spec.read_text()
old = '''  expect(secondBox!.x).toBeGreaterThan(firstBox!.x);\n  await capture(page, "14-paralelni-skupiny-vedle-sebe.png");\n});\n'''
new = '''  expect(secondBox!.x).toBeGreaterThan(firstBox!.x);\n\n  await parallelCards.nth(0).click();\n  const detailDialog = page.getByRole("dialog");\n  await expect(\n    detailDialog.getByRole("heading", { name: "Detail výukového bloku" }),\n  ).toBeVisible();\n  await expect(detailDialog.getByText("Vyučující")).toBeVisible();\n  await expect(detailDialog).toContainText(/Český Učitel|Matematický Učitel/);\n  await detailDialog.getByRole("button", { name: "Zavřít" }).click();\n\n  await capture(page, "14-paralelni-skupiny-vedle-sebe.png");\n});\n'''
if old not in text:
    raise SystemExit("e2e detail target not found")
spec.write_text(text.replace(old, new, 1))
