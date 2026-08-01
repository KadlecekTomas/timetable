from pathlib import Path


def replace(path: str, old: str, new: str, count: int = -1) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:180]!r}")
    file.write_text(text.replace(old, new, count))


prefill = "apps/web/lib/import/client-workbook-prefill.ts"
client_test = "apps/web/tests/client-workbook.test.ts"
school_test = "apps/web/tests/school-client-workbook.test.ts"

replace(
    prefill,
    'const SPLIT_SUBJECT_CODES = ["CJ", "M", "INF", "JAZ1", "JAZ2"] as const;',
    'const SPLIT_SUBJECT_CODES = ["CJ", "M", "JAZ1", "JAZ2"] as const;',
)
replace(
    prefill,
    "    }\n  }\n\n  for (const classCode of PE_CLASS_CODES) {",
    "    }\n\n    rows.push([\n      `${classCode}-INF`,\n      classCode,\n      null,\n      \"INF\",\n      null,\n      \"Celá třída\",\n      1,\n      \"Jednotlivé hodiny\",\n      0,\n      null,\n      \"POČÍTAČOVÁ UČEBNA\",\n      1,\n      0,\n    ]);\n  }\n\n  for (const classCode of PE_CLASS_CODES) {",
    1,
)
replace(
    prefill,
    "Připraveno pro český jazyk, matematiku, informatiku a dva cizí jazyky.",
    "Připraveno pro český jazyk, matematiku a dva cizí jazyky. Informatika zůstává pro celou třídu.",
)

replace(client_test, 'getCell("E6").dataValidation.type', 'getCell("F6").dataValidation.type')
replace(
    client_test,
    '      "6A",\n      "M",',
    '      "6A",\n      "",\n      "M",',
    1,
)

replace(school_test, "filledRows(assignments, 12)", "filledRows(assignments, 13)")
replace(
    school_test,
    "assignmentRows.slice(0, 9).map((row) => row.slice(0, 7))",
    "assignmentRows.slice(0, 9).map((row) => row.slice(0, 8))",
)
for old, new in [
    ('["6A-CJ-S1", "6A", "CJ", "", "Skupina 1", "", "Jednotlivé hodiny"]', '["6A-CJ-S1", "6A", "", "CJ", "", "Skupina 1", "", "Jednotlivé hodiny"]'),
    ('["6A-CJ-S2", "6A", "CJ", "", "Skupina 2", "", "Jednotlivé hodiny"]', '["6A-CJ-S2", "6A", "", "CJ", "", "Skupina 2", "", "Jednotlivé hodiny"]'),
    ('["6A-M-S1", "6A", "M", "", "Skupina 1", "", "Jednotlivé hodiny"]', '["6A-M-S1", "6A", "", "M", "", "Skupina 1", "", "Jednotlivé hodiny"]'),
    ('["6A-M-S2", "6A", "M", "", "Skupina 2", "", "Jednotlivé hodiny"]', '["6A-M-S2", "6A", "", "M", "", "Skupina 2", "", "Jednotlivé hodiny"]'),
    ('["6A-INF", "6A", "INF", "", "Celá třída", "1", "Jednotlivé hodiny"]', '["6A-INF", "6A", "", "INF", "", "Celá třída", "1", "Jednotlivé hodiny"]'),
    ('["6A-JAZ1-S1", "6A", "JAZ1", "", "Skupina 1", "", "Jednotlivé hodiny"]', '["6A-JAZ1-S1", "6A", "", "JAZ1", "", "Skupina 1", "", "Jednotlivé hodiny"]'),
    ('["6A-JAZ1-S2", "6A", "JAZ1", "", "Skupina 2", "", "Jednotlivé hodiny"]', '["6A-JAZ1-S2", "6A", "", "JAZ1", "", "Skupina 2", "", "Jednotlivé hodiny"]'),
    ('["6A-JAZ2-S1", "6A", "JAZ2", "", "Skupina 1", "", "Jednotlivé hodiny"]', '["6A-JAZ2-S1", "6A", "", "JAZ2", "", "Skupina 1", "", "Jednotlivé hodiny"]'),
    ('["6A-JAZ2-S2", "6A", "JAZ2", "", "Skupina 2", "", "Jednotlivé hodiny"]', '["6A-JAZ2-S2", "6A", "", "JAZ2", "", "Skupina 2", "", "Jednotlivé hodiny"]'),
]:
    replace(school_test, old, new)
replace(school_test, 'row[2] === "INF"', 'row[3] === "INF"')
replace(
    school_test,
    "      row[4],\n      row[5],\n      row[6],\n      row[7],\n      row[9],\n      row[10],\n      row[11],",
    "      row[5],\n      row[6],\n      row[7],\n      row[8],\n      row[10],\n      row[11],\n      row[12],",
)
