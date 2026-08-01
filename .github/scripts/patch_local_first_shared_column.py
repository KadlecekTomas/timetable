from pathlib import Path

path = Path("apps/web/e2e/local-first.spec.ts")
text = path.read_text()
for subject in ("M", "CJ"):
    old = f'      "6A",\n      "{subject}",'
    new = f'      "6A",\n      "",\n      "{subject}",'
    if old not in text:
        raise SystemExit(f"Missing {subject} assignment row")
    text = text.replace(old, new, 1)
path.write_text(text)
