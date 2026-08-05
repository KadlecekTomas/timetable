from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing patch anchor: {label}")
    return text.replace(old, new, 1)


page_path = Path("apps/web/app/coverage/page.tsx")
page = page_path.read_text(encoding="utf-8")

page = replace_once(
    page,
    "  Filter,\n  Upload,",
    "  Filter,\n  Sparkles,\n  Upload,",
    "Sparkles icon import",
)
page = replace_once(
    page,
    '} from "@/lib/domain/coverage-overview";\n',
    '} from "@/lib/domain/coverage-overview";\nimport { autoCoverTeachingPlan } from "@/lib/domain/auto-cover-teaching-plan";\n',
    "auto coverage import",
)
page = replace_once(
    page,
    "  loadTeachingPlan,\n  type TeachingPlan,",
    "  loadTeachingPlan,\n  saveTeachingPlan,\n  type TeachingPlan,",
    "save teaching plan import",
)

handler = '''
  function completeCoverage(): void {
    setError(null);
    setMessage(null);

    try {
      const result = autoCoverTeachingPlan(teachingPlan, staffingPlan);
      if (result.unresolved.length > 0) {
        const details = result.unresolved
          .slice(0, 3)
          .map(
            (item) =>
              `${item.classCode || item.roleLabel} ${item.subjectCode}: ${item.reason}`,
          )
          .join(" ");
        setError(
          `Automatické doplnění nelze bezpečně dokončit. ${details}`,
        );
        return;
      }

      const savedStaffing = saveStaffingPlan(result.staffingPlan);
      const savedTeaching = saveTeachingPlan(result.teachingPlan);
      setStaffingPlan(savedStaffing);
      setTeachingPlan(savedTeaching);
      setSelectedKey("");

      const assignmentLabel =
        result.assignments.length === 1
          ? "chybějící místo"
          : result.assignments.length >= 2 && result.assignments.length <= 4
            ? "chybějící místa"
            : "chybějících míst";
      const summary = [
        `Automaticky doplněno ${result.assignments.length} ${assignmentLabel}.`,
      ];
      if (result.totalIncreasedHours > 0) {
        summary.push(
          `Úvazek byl navýšen u ${result.increasedTeachers.length} učitelů celkem o ${formatHours(result.totalIncreasedHours)} h.`,
        );
      }
      if (result.forcedAssignmentCount > 0) {
        summary.push(
          `Pozor: ${result.forcedAssignmentCount} přiřazení nemělo v datech uvedenou aprobaci; byl použit nejméně zatížený dostupný učitel.`,
        );
      }
      setMessage(summary.join(" "));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Automatické doplnění se nepodařilo.",
      );
    }
  }
'''
page = replace_once(
    page,
    "\n  if (!loaded) {",
    f"\n{handler}\n  if (!loaded) {{",
    "complete coverage handler",
)

old_actions = '''        actions={
          <Button asChild variant="outline">
            <Link href={`/teaching-plan?${context}`}>
              <Wrench className="size-4" aria-hidden="true" />
              Podrobný editor
            </Link>
          </Button>
        }
'''
new_actions = '''        actions={
          <div className="flex flex-wrap gap-2">
            {hasStaffing && !allCovered ? (
              <Button type="button" onClick={completeCoverage}>
                <Sparkles className="size-4" aria-hidden="true" />
                Doplnit vše automaticky
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/teaching-plan?${context}`}>
                <Wrench className="size-4" aria-hidden="true" />
                Podrobný editor
              </Link>
            </Button>
          </div>
        }
'''
page = replace_once(page, old_actions, new_actions, "page header actions")
page_path.write_text(page, encoding="utf-8")

workflow_path = Path(".github/workflows/ci.yml")
workflow = workflow_path.read_text(encoding="utf-8")
workflow = replace_once(
    workflow,
    "e2e/subject-rotation-and-sports.spec.ts e2e/coverage-overview.spec.ts",
    "e2e/subject-rotation-and-sports.spec.ts e2e/auto-cover.spec.ts e2e/coverage-overview.spec.ts",
    "CI auto-cover E2E inclusion",
)
workflow_path.write_text(workflow, encoding="utf-8")
