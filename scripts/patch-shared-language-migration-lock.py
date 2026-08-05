from pathlib import Path

path = Path("apps/web/lib/local/teaching-plan-school-v3.ts")
text = path.read_text(encoding="utf-8")

old = '''const SECOND_FOREIGN_LANGUAGE_CODE = "JAZ2";
const ELECTIVE_SUBJECT_CODE = "VOL";
'''
new = '''const SECOND_FOREIGN_LANGUAGE_CODE = "JAZ2";
const ELECTIVE_SUBJECT_CODE = "VOL";

let migratingTeachingPlan = false;
'''
if old not in text:
    raise RuntimeError("Missing migration lock anchor")
text = text.replace(old, new, 1)

old = '''  if (
    typeof window !== "undefined" &&
    JSON.stringify(loaded.rows) !== JSON.stringify(enforced.rows)
  ) {
    return enforceCurrentSchoolTeachingStructure(
      base.saveTeachingPlan(enforced),
    );
  }
'''
new = '''  if (
    typeof window !== "undefined" &&
    !migratingTeachingPlan &&
    JSON.stringify(loaded.rows) !== JSON.stringify(enforced.rows)
  ) {
    migratingTeachingPlan = true;
    try {
      return enforceCurrentSchoolTeachingStructure(
        base.saveTeachingPlan(enforced),
      );
    } finally {
      migratingTeachingPlan = false;
    }
  }
'''
if old not in text:
    raise RuntimeError("Missing load migration anchor")
text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
