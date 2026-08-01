from pathlib import Path

path = Path("apps/web/e2e/school-scale.spec.ts")
text = path.read_text()

old = '''function buildAvailabilityRows() {
  const rows: Array<Array<string | number | null>> = ['''
new = '''function validPeriodForDay(day: (typeof DAY_LABELS)[number], seed: number) {
  const periodCount = day === "Pátek" ? 7 : 8;
  return (seed % periodCount) + 1;
}

function buildAvailabilityRows() {
  const rows: Array<Array<string | number | null>> = ['''
if old not in text:
    raise SystemExit("Missing buildAvailabilityRows anchor")
text = text.replace(old, new, 1)

old_block = '''      rows.push([
        "Učitel",
        teacher.code,
        DAY_LABELS[index % DAY_LABELS.length],
        ((index * 2) % 8) + 1,
        "Nemůže",
        null,
        "Individuální nedostupnost",
      ]);
      rows.push([
        "Učitel",
        teacher.code,
        DAY_LABELS[(index + 2) % DAY_LABELS.length],
        ((index * 3 + 3) % 8) + 1,
        "Nemůže",
        null,
        "Individuální nedostupnost",
      ]);
      rows.push([
        "Učitel",
        teacher.code,
        DAY_LABELS[(index + 1) % DAY_LABELS.length],
        ((index + 1) % 6) + 1,
        "Preferuje",
        5,
        "Preferovaný dopolední slot",
      ]);'''
new_block = '''      const firstUnavailableDay = DAY_LABELS[index % DAY_LABELS.length]!;
      const secondUnavailableDay =
        DAY_LABELS[(index + 2) % DAY_LABELS.length]!;
      const preferredDay = DAY_LABELS[(index + 1) % DAY_LABELS.length]!;
      rows.push([
        "Učitel",
        teacher.code,
        firstUnavailableDay,
        validPeriodForDay(firstUnavailableDay, index * 2),
        "Nemůže",
        null,
        "Individuální nedostupnost",
      ]);
      rows.push([
        "Učitel",
        teacher.code,
        secondUnavailableDay,
        validPeriodForDay(secondUnavailableDay, index * 3 + 3),
        "Nemůže",
        null,
        "Individuální nedostupnost",
      ]);
      rows.push([
        "Učitel",
        teacher.code,
        preferredDay,
        validPeriodForDay(preferredDay, index + 1) % 6 || 6,
        "Preferuje",
        5,
        "Preferovaný dopolední slot",
      ]);'''
if old_block not in text:
    raise SystemExit("Missing generated availability rows")
text = text.replace(old_block, new_block, 1)
path.write_text(text)
