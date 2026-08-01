from pathlib import Path
import re

path = Path("apps/web/tests/school-client-workbook.test.ts")
text = path.read_text()
pattern = r'assert\.match\(organization\.getCell\("A10"\)\.text, /[^/]+/\);'
replacement = (
    'assert.match(organization.getCell("A10").text, '
    '/9A a další společná třída 9C/);'
)
updated, count = re.subn(pattern, replacement, text, count=1)
if count != 1:
    raise SystemExit("Missing organization copy assertion")
path.write_text(updated)
