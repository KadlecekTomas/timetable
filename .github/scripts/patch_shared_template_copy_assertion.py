from pathlib import Path

path = Path("apps/web/tests/school-client-workbook.test.ts")
text = path.read_text()
old = 'assert.match(organization.getCell("A10").text, /automaticky nevynucuje/);'
new = 'assert.match(organization.getCell("A10").text, /9A a další společná třída 9C/);'
if new in text:
    raise SystemExit(0)
if old not in text:
    raise SystemExit("Missing obsolete shared-class copy assertion")
path.write_text(text.replace(old, new))
