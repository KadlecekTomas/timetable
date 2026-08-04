import { readFile } from "node:fs/promises";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Usage: diagnose-real-workbook <file.xlsx>");

  const storage = new MemoryStorage();
  Object.assign(globalThis, {
    window: {
      localStorage: storage,
      dispatchEvent: () => true,
    },
    localStorage: storage,
  });

  const bytes = new Uint8Array(await readFile(filePath));

  console.log("STAGE analyze:start");
  const { analyzeStaffingWorkbook } = await import(
    "../apps/web/lib/import/staffing-workbook-school-v2"
  );
  const analysis = await analyzeStaffingWorkbook(bytes);
  console.log("STAGE analyze:done", {
    valid: analysis.valid,
    teachers: analysis.plan.teachers.length,
    issues: analysis.issues.length,
  });

  console.log("STAGE staffing-save:start");
  const { saveStaffingPlan } = await import(
    "../apps/web/lib/local/staffing-plan-school-v2"
  );
  const staffingPlan = saveStaffingPlan(analysis.plan);
  console.log("STAGE staffing-save:done", {
    teachers: staffingPlan.teachers.length,
  });

  console.log("STAGE teaching-load:start");
  const { loadTeachingPlan } = await import(
    "../apps/web/lib/local/teaching-plan-school-v3"
  );
  const teachingPlan = loadTeachingPlan();
  console.log("STAGE teaching-load:done", {
    classes: teachingPlan.classes.length,
    rows: teachingPlan.rows.length,
  });

  console.log("STAGE coverage:start");
  const { buildCoverageOverview } = await import(
    "../apps/web/lib/domain/coverage-overview"
  );
  const overview = buildCoverageOverview(teachingPlan, staffingPlan);
  console.log("STAGE coverage:done", overview.summary);
}

main().catch((error) => {
  console.error("DIAGNOSTIC_FAILURE");
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
