from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:180]!r}")
    file.write_text(text.replace(old, new, 1))


overrides = "apps/web/lib/import/school-staffing-overrides.ts"
template_test = "apps/web/tests/school-client-workbook.test.ts"

replace_once(
    overrides,
    "const ASSIGNMENT_COLUMN_COUNT = 12;",
    "const ASSIGNMENT_COLUMN_COUNT = 13;",
)
replace_once(
    overrides,
    '    const subjectCode = String(row[2] ?? "").trim();\n    const group = String(row[4] ?? "").trim();',
    '    const subjectCode = String(row[3] ?? "").trim();\n    const group = String(row[5] ?? "").trim();',
)
replace_once(
    overrides,
    '        classCode,\n        "INF",\n        null,\n        "Celá třída",',
    '        classCode,\n        null,\n        "INF",\n        null,\n        "Celá třída",',
)

replace_once(
    template_test,
    "  const assignmentRows = filledRows(assignments, 12);",
    "  const assignmentRows = filledRows(assignments, 13);",
)
replace_once(
    template_test,
    "    assignmentRows.slice(0, 9).map((row) => row.slice(0, 7)),",
    "    assignmentRows\n      .slice(0, 9)\n      .map((row) => [row[0], row[1], ...row.slice(3, 8)]),",
)
replace_once(
    template_test,
    '  const informaticsRows = assignmentRows.filter((row) => row[2] === "INF");',
    '  const informaticsRows = assignmentRows.filter((row) => row[3] === "INF");',
)
replace_once(
    template_test,
    "      row[4],\n      row[5],\n      row[6],\n      row[7],\n      row[9],\n      row[10],\n      row[11],",
    "      row[5],\n      row[6],\n      row[7],\n      row[8],\n      row[10],\n      row[11],\n      row[12],",
)
replace_once(
    template_test,
    '  assert.match(organization.getCell("A10").text, /automaticky nevynucuje/);',
    '  assert.match(organization.getCell("A10").text, /automaticky umístí/);',
)
