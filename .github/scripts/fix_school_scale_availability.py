from pathlib import Path

path = Path("apps/web/e2e/school-scale.spec.ts")
text = path.read_text()
old = """  return rows;
}

async function createRealisticSchoolWorkbook"""
new = """  return rows.map((row) => {
    if (row[2] === \"Pátek\" && typeof row[3] === \"number\" && row[3] > 7) {
      const normalized = [...row];
      normalized[3] = 7;
      return normalized;
    }
    return row;
  });
}

async function createRealisticSchoolWorkbook"""
if new in text:
    raise SystemExit(0)
if old not in text:
    raise SystemExit("Missing school-scale availability return block")
path.write_text(text.replace(old, new, 1))
