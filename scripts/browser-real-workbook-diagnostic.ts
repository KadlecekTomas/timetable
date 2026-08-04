import { buildCoverageOverview } from "../apps/web/lib/domain/coverage-overview";
import { analyzeStaffingWorkbook } from "../apps/web/lib/import/staffing-workbook-school-v2";
import { saveStaffingPlan } from "../apps/web/lib/local/staffing-plan-school-v2";
import { loadTeachingPlan } from "../apps/web/lib/local/teaching-plan-school-v3";

const input = document.querySelector<HTMLInputElement>("#file");
const output = document.querySelector<HTMLPreElement>("#output");

function write(message: string, detail?: unknown): void {
  if (!output) return;
  output.textContent += `${message}${
    detail === undefined ? "" : ` ${JSON.stringify(detail, null, 2)}`
  }\n`;
}

if (!input || !output) throw new Error("Diagnostic controls are missing.");

input.addEventListener("change", async () => {
  output.textContent = "";
  const file = input.files?.[0];
  if (!file) return;

  try {
    localStorage.clear();
    const bytes = new Uint8Array(await file.arrayBuffer());

    write("STAGE analyze:start");
    const analysis = await analyzeStaffingWorkbook(bytes);
    write("STAGE analyze:done", {
      valid: analysis.valid,
      teachers: analysis.plan.teachers.length,
      issues: analysis.issues.length,
    });

    write("STAGE staffing-save:start");
    const staffingPlan = saveStaffingPlan(analysis.plan);
    write("STAGE staffing-save:done", {
      teachers: staffingPlan.teachers.length,
    });

    write("STAGE teaching-load:start");
    const teachingPlan = loadTeachingPlan();
    write("STAGE teaching-load:done", {
      classes: teachingPlan.classes.length,
      rows: teachingPlan.rows.length,
    });

    write("STAGE coverage:start");
    const overview = buildCoverageOverview(teachingPlan, staffingPlan);
    write("STAGE coverage:done", overview.summary);
    write("DIAGNOSTIC_SUCCESS");
  } catch (error) {
    write("DIAGNOSTIC_FAILURE");
    write(error instanceof Error ? (error.stack ?? error.message) : error);
  }
});
