from pathlib import Path


def replace(path: str, old: str, new: str, count: int = -1) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:150]!r}")
    file.write_text(text.replace(old, new, count))


workbook = "apps/web/lib/import/workbook.ts"
client = "apps/web/lib/import/client-workbook.ts"
prefill = "apps/web/lib/import/client-workbook-prefill.ts"

replace(
    workbook,
    "      class_code: requiredText(\n        values.class_code ?? \"\",\n        issues,\n        SHEETS.assignments,\n        rowNumber,\n        \"class_code\",\n      ),\n      subject_code: requiredText(",
    "      class_code: requiredText(\n        values.class_code ?? \"\",\n        issues,\n        SHEETS.assignments,\n        rowNumber,\n        \"class_code\",\n      ),\n      additional_class_codes: (values.additional_class_codes ?? \"\")\n        .split(/[;,]/)\n        .map((value) => value.trim())\n        .filter(Boolean),\n      subject_code: requiredText(",
    1,
)
replace(
    workbook,
    "    for (const [exists, column, value, noun] of references) {",
    "    assignment.additional_class_codes.forEach((classCode) => {\n      if (classCode === assignment.class_code || !classCodes.has(classCode)) {\n        issues.push(\n          issue(\n            \"ERROR\",\n            SHEETS.assignments,\n            sourceRow,\n            \"additional_class_codes\",\n            \"REFERENCE_NOT_FOUND\",\n            `Společná třída ${classCode} neexistuje nebo je stejná jako hlavní třída.`,\n            classCode,\n          ),\n        );\n      }\n    });\n    for (const [exists, column, value, noun] of references) {",
    1,
)

replace(
    client,
    'export const CLIENT_IMPORT_TEMPLATE_VERSION = "2.0.0" as const;',
    'export const CLIENT_IMPORT_TEMPLATE_VERSION = "2.1.0" as const;',
)
replace(
    client,
    '      col("class_code", "Třída *", true, 14, "Zkratka z listu 2. Třídy."),\n      col(',
    '      col("class_code", "Třída *", true, 14, "Zkratka z listu 2. Třídy."),\n      col(\n        "additional_class_codes",\n        "Další společné třídy",\n        false,\n        24,\n        "Pro společnou výuku více tříd, například 9C. Více kódů oddělte čárkou.",\n      ),\n      col(',
    1,
)
replace(
    client,
    "    if (definition.columns.every((column) => found.has(column.key)))\n      return { row, columns: found };",
    "    if (\n      definition.columns\n        .filter((column) => column.key !== \"additional_class_codes\")\n        .every((column) => found.has(column.key))\n    )\n      return { row, columns: found };",
)
replace(
    client,
    "  if (version !== CLIENT_IMPORT_TEMPLATE_VERSION) return null;",
    '  if (!["2.0.0", CLIENT_IMPORT_TEMPLATE_VERSION].includes(version)) return null;',
)
replace(
    client,
    "      const values = definition.columns.map((column) =>\n        mapCell(\n          source.getCell(row, header.columns.get(column.key)!).value,\n          column.valueMap,\n        ),\n      );",
    "      const values = definition.columns.map((column) => {\n        const sourceColumn = header.columns.get(column.key);\n        return sourceColumn\n          ? mapCell(source.getCell(row, sourceColumn).value, column.valueMap)\n          : null;\n      });",
)

replace(
    prefill,
    "          classCode,\n          subjectCode,",
    "          classCode,\n          null,\n          subjectCode,",
)
replace(
    prefill,
    "        classCode,\n        \"TV\",",
    "        classCode,\n        null,\n        \"TV\",",
)
replace(
    prefill,
    "    \"Půlení jedné třídy je v Rozvrháři podporované. Spojování různých tříd v jedné společné hodině je zde zatím evidované jako organizační požadavek pro další rozšíření plánovacího modelu.\";",
    "    \"Půlení jedné třídy i společná výuka více tříd jsou v Rozvrháři podporované. Další společné třídy zadejte přímo na listu 5. Kdo co učí.\";",
)
replace(
    prefill,
    "  sheet.mergeCells(\"A10:E10\");\n  const warning = sheet.getCell(\"A10\");\n  warning.value =\n    \"Současný solver automaticky nevynucuje povinné ani volitelné spojení různých tříd. Toto pravidlo musí být po vytvoření rozvrhu zkontrolované ručně, dokud nebude doplněná podpora společných hodin více tříd.\";",
    "  sheet.mergeCells(\"A10:E10\");\n  const warning = sheet.getCell(\"A10\");\n  warning.value =\n    \"Pro společnou výuku 9.A + 9.C použijte jeden řádek: hlavní třída 9A a další společná třída 9C. Solver pak blok automaticky umístí do rozvrhu obou tříd současně.\";",
)
