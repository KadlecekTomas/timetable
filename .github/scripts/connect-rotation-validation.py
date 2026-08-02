from pathlib import Path

path = Path("apps/web/lib/domain/validation.ts")
content = path.read_text()

import_line = 'import { validateRotationSchedule } from "./rotation-validation";'
if import_line not in content:
    marker = '''import {
  crossesLunchBreak,
  MIN_LUNCH_BREAK_MINUTES,
  MORNING_PERIOD_LIMIT,
} from "./school-day";'''
    if marker not in content:
        raise SystemExit("school-day import marker not found")
    content = content.replace(marker, f"{marker}\n{import_line}", 1)

call_line = "issues.push(...validateRotationSchedule(snapshot, lessonsByAssignment));"
if call_line not in content:
    marker = '''  return issues.sort((left, right) => {'''
    if marker not in content:
        raise SystemExit("validation return marker not found")
    content = content.replace(
        marker,
        f"  {call_line}\n\n{marker}",
        1,
    )

path.write_text(content)
