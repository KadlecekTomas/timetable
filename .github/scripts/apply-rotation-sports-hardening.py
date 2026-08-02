from __future__ import annotations

import re
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    content = file_path.read_text()
    if old not in content:
        raise SystemExit(f"Expected fragment not found in {path}: {old[:180]!r}")
    file_path.write_text(content.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    file_path = Path(path)
    content = file_path.read_text()
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Expected regex not found in {path}: {pattern[:180]!r}")
    file_path.write_text(updated)


# ---------------------------------------------------------------------------
# Solver contract and hard rotation placement semantics.
# ---------------------------------------------------------------------------
replace_once(
    "apps/solver/app/models.py",
    '''class ClassProfile(StrEnum):
    REGULAR = "REGULAR"
    SPORTS = "SPORTS"
    CUSTOM = "CUSTOM"


class AvailabilityEntityType(StrEnum):''',
    '''class ClassProfile(StrEnum):
    REGULAR = "REGULAR"
    SPORTS = "SPORTS"
    CUSTOM = "CUSTOM"


class RotationPlacement(StrEnum):
    ADJACENT = "ADJACENT"
    SAME_DAY = "SAME_DAY"
    FLEXIBLE = "FLEXIBLE"


class AvailabilityEntityType(StrEnum):''',
)
replace_once(
    "apps/solver/app/models.py",
    '''    rotation_key: str | None = None
    rotation_leg: int | None = Field(default=None, ge=1, le=2)

    @model_validator''',
    '''    rotation_key: str | None = None
    rotation_leg: int | None = Field(default=None, ge=1, le=2)
    rotation_placement: RotationPlacement | None = None

    @model_validator''',
)
replace_once(
    "apps/solver/app/models.py",
    '''        if self.rotation_key and not self.parallel_key:
            raise ValueError("Rotation assignments require a parallel_key")
        return self''',
    '''        if self.rotation_key and not self.parallel_key:
            raise ValueError("Rotation assignments require a parallel_key")
        if self.rotation_placement is not None and not self.rotation_key:
            raise ValueError("rotation_placement requires a rotation_key")
        return self''',
)
replace_once(
    "apps/solver/app/models.py",
    '''            if len(shapes) != 1:
                raise ValueError(f"All assignments in rotation {rotation_key} must have the same lesson shape")
            if leg_1_group_1.subject_id == leg_1_group_2.subject_id:''',
    '''            if len(shapes) != 1:
                raise ValueError(f"All assignments in rotation {rotation_key} must have the same lesson shape")
            class_sets = {
                tuple(sorted([item.class_id, *item.additional_class_ids]))
                for item in assignments
            }
            if len(class_sets) != 1:
                raise ValueError(f"All assignments in rotation {rotation_key} must target the same classes")
            leg_1_parallel_keys = {
                item.parallel_key for item in assignments if item.rotation_leg == 1
            }
            leg_2_parallel_keys = {
                item.parallel_key for item in assignments if item.rotation_leg == 2
            }
            if len(leg_1_parallel_keys) != 1 or len(leg_2_parallel_keys) != 1:
                raise ValueError(f"Each leg in rotation {rotation_key} must share one parallel_key")
            if leg_1_parallel_keys == leg_2_parallel_keys:
                raise ValueError(f"Rotation {rotation_key} must use a different parallel_key for each leg")
            placements = {
                item.rotation_placement or RotationPlacement.SAME_DAY
                for item in assignments
            }
            if len(placements) != 1:
                raise ValueError(f"All assignments in rotation {rotation_key} must share rotation_placement")
            if leg_1_group_1.subject_id == leg_1_group_2.subject_id:''',
)

replace_once(
    "apps/solver/app/main.py",
    "from app.school_day import crosses_lunch_break",
    "from app.rotations import add_rotation_constraints\nfrom app.school_day import crosses_lunch_break",
)
replace_once(
    "apps/solver/app/main.py",
    '''                model.add(
                    sum(left_at_position) == sum(right_at_position)
                )

    for assignment in payload.assignments:''',
    '''                model.add(
                    sum(left_at_position) == sum(right_at_position)
                )

    rotation_diagnostics = add_rotation_constraints(
        model=model,
        payload=payload,
        blocks_by_assignment=blocks_by_assignment,
        variables=variables,
        objective_terms=objective_terms,
    )
    if rotation_diagnostics:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ROTATION_PLACEMENT_INFEASIBLE",
                "message": "Některou výměnu předmětů nelze umístit podle zvoleného režimu.",
                "causes": rotation_diagnostics,
            },
        )

    for assignment in payload.assignments:''',
)

replace_once(
    "apps/solver/app/validator.py",
    "from app.school_day import crosses_lunch_break",
    "from app.rotations import validate_rotation_schedule\nfrom app.school_day import crosses_lunch_break",
)
replace_once(
    "apps/solver/app/validator.py",
    '''    return sorted(
        issues,''',
    '''    issues.extend(validate_rotation_schedule(payload, lessons_by_assignment))

    return sorted(
        issues,''',
)

# ---------------------------------------------------------------------------
# Browser-side canonical snapshot and IndexedDB persistence.
# ---------------------------------------------------------------------------
replace_once(
    "apps/web/lib/domain/contracts.ts",
    '''export type TeachingGroup = "WHOLE" | "GROUP_1" | "GROUP_2";
export type LessonShape = "SINGLE" | "DOUBLE" | "MIXED";''',
    '''export type TeachingGroup = "WHOLE" | "GROUP_1" | "GROUP_2";
export type LessonShape = "SINGLE" | "DOUBLE" | "MIXED";
export type ClassProfile = "REGULAR" | "SPORTS" | "CUSTOM";
export type RotationPlacement = "ADJACENT" | "SAME_DAY" | "FLEXIBLE";''',
)
replace_once(
    "apps/web/lib/domain/contracts.ts",
    '''export interface SnapshotClass {
  id: string;
  code: string;
  name: string;
  grade: number;
}''',
    '''export interface SnapshotClass {
  id: string;
  code: string;
  name: string;
  grade: number;
  profile: ClassProfile;
}''',
)
replace_once(
    "apps/web/lib/domain/contracts.ts",
    '''  max_per_day?: number | null;
  min_day_gap?: number | null;
}''',
    '''  max_per_day?: number | null;
  min_day_gap?: number | null;
  parallel_key?: string | null;
  rotation_key?: string | null;
  rotation_leg?: number | null;
  rotation_placement?: RotationPlacement | null;
}''',
)
replace_once(
    "apps/web/lib/domain/contracts.ts",
    '''  same_day_concentration: number;
  late_period: number;
}''',
    '''  same_day_concentration: number;
  late_period: number;
  rotation_spread: number;
}''',
)

replace_once(
    "apps/web/lib/local/api.ts",
    '''  same_day_concentration: 6,
  late_period: 1,
};''',
    '''  same_day_concentration: 6,
  late_period: 1,
  rotation_spread: 75,
};''',
)
replace_once(
    "apps/web/lib/local/api.ts",
    '''interface LocalClass {
  id: string;
  code: string;
  grade: number;
  name: string;
}''',
    '''interface LocalClass {
  id: string;
  code: string;
  grade: number;
  name: string;
  profile: "REGULAR" | "SPORTS" | "CUSTOM";
}''',
)
replace_once(
    "apps/web/lib/local/api.ts",
    '''  maxPerDay: number | null;
  minDayGap: number | null;
}''',
    '''  maxPerDay: number | null;
  minDayGap: number | null;
  parallelKey: string | null;
  rotationKey: string | null;
  rotationLeg: number | null;
  rotationPlacement: "ADJACENT" | "SAME_DAY" | "FLEXIBLE" | null;
}''',
)
replace_once(
    "apps/web/lib/local/api.ts",
    '''export async function getLocalProject(): Promise<LocalProject> {
  const stored = await readStoredProject();
  if (stored?.schemaVersion === 1) return stored;
  const created = createDefaultProject();
  await writeStoredProject(created);
  return created;
}''',
    '''function normalizeStoredProject(project: LocalProject): LocalProject {
  return {
    ...project,
    classes: project.classes.map((schoolClass) => ({
      ...schoolClass,
      profile: ["REGULAR", "SPORTS", "CUSTOM"].includes(
        String(schoolClass.profile),
      )
        ? schoolClass.profile
        : /\\.(B|D)$/i.test(schoolClass.code)
          ? "SPORTS"
          : "REGULAR",
    })),
    assignments: project.assignments.map((assignment) => ({
      ...assignment,
      parallelKey: assignment.parallelKey ?? null,
      rotationKey: assignment.rotationKey ?? null,
      rotationLeg: assignment.rotationLeg ?? null,
      rotationPlacement: assignment.rotationPlacement ?? null,
    })),
  };
}

export async function getLocalProject(): Promise<LocalProject> {
  const stored = await readStoredProject();
  if (stored?.schemaVersion === 1) {
    return normalizeStoredProject(stored);
  }
  const created = createDefaultProject();
  await writeStoredProject(created);
  return created;
}''',
)
replace_once(
    "apps/web/lib/local/api.ts",
    '''      name: schoolClass.name,
      grade: schoolClass.grade,
    })),''',
    '''      name: schoolClass.name,
      grade: schoolClass.grade,
      profile: schoolClass.profile,
    })),''',
)
replace_once(
    "apps/web/lib/local/api.ts",
    '''      max_per_day: assignment.maxPerDay,
      min_day_gap: assignment.minDayGap,
    })),''',
    '''      max_per_day: assignment.maxPerDay,
      min_day_gap: assignment.minDayGap,
      parallel_key: assignment.parallelKey,
      rotation_key: assignment.rotationKey,
      rotation_leg: assignment.rotationLeg,
      rotation_placement: assignment.rotationPlacement,
    })),''',
)
replace_once(
    "apps/web/lib/local/api.ts",
    '''        grade: Number(body.grade),
        name: stringField(body, "name"),
      });''',
    '''        grade: Number(body.grade),
        name: stringField(body, "name"),
        profile: ["REGULAR", "SPORTS", "CUSTOM"].includes(
          stringField(body, "profile"),
        )
          ? (stringField(body, "profile") as LocalClass["profile"])
          : /\\.(B|D)$/i.test(code)
            ? "SPORTS"
            : "REGULAR",
      });''',
)
replace_once(
    "apps/web/lib/local/api.ts",
    '''        maxPerDay: nullableNumber(body, "maxPerDay"),
        minDayGap: nullableNumber(body, "minDayGap"),
      });''',
    '''        maxPerDay: nullableNumber(body, "maxPerDay"),
        minDayGap: nullableNumber(body, "minDayGap"),
        parallelKey: stringField(body, "parallelKey") || null,
        rotationKey: stringField(body, "rotationKey") || null,
        rotationLeg: [1, 2].includes(Number(body.rotationLeg))
          ? Number(body.rotationLeg)
          : null,
        rotationPlacement: ["ADJACENT", "SAME_DAY", "FLEXIBLE"].includes(
          stringField(body, "rotationPlacement"),
        )
          ? (stringField(
              body,
              "rotationPlacement",
            ) as LocalAssignment["rotationPlacement"])
          : null,
      });''',
)

# ---------------------------------------------------------------------------
# Human teaching-plan model: three intuitive exchange timing modes.
# ---------------------------------------------------------------------------
replace_once(
    "apps/web/lib/local/teaching-plan.ts",
    '''export type TeachingOrganization = "WHOLE" | "SPLIT" | "ROTATION";
export type TeachingClassProfile = "REGULAR" | "SPORTS" | "CUSTOM";''',
    '''export type TeachingOrganization = "WHOLE" | "SPLIT" | "ROTATION";
export type TeachingClassProfile = "REGULAR" | "SPORTS" | "CUSTOM";
export type TeachingRotationPlacement =
  | "ADJACENT"
  | "SAME_DAY"
  | "FLEXIBLE";''',
)
replace_once(
    "apps/web/lib/local/teaching-plan.ts",
    '''export const TEACHING_CLASS_PROFILES: Array<{''',
    '''export const TEACHING_ROTATION_PLACEMENTS: Array<{
  value: TeachingRotationPlacement;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: "ADJACENT",
    label: "Hned po sobě",
    shortLabel: "Bezprostředně",
    description:
      "Druhé rameno začne okamžitě po prvním. Pořadí obou ramen vybere algoritmus.",
  },
  {
    value: "SAME_DAY",
    label: "Ve stejný den",
    shortLabel: "Stejný den",
    description:
      "Ramena mohou být ráno a odpoledne, ale obě proběhnou v jednom dni.",
  },
  {
    value: "FLEXIBLE",
    label: "Kdykoliv během týdne",
    shortLabel: "Flexibilně",
    description:
      "Použijte jen při složitých dostupnostech. Algoritmus je stále drží co nejblíž.",
  },
];

export const TEACHING_CLASS_PROFILES: Array<{''',
)
replace_once(
    "apps/web/lib/local/teaching-plan.ts",
    '''  organization: TeachingOrganization;
  primaryTeacherId: string;''',
    '''  organization: TeachingOrganization;
  rotationPlacement?: TeachingRotationPlacement;
  primaryTeacherId: string;''',
)
replace_once(
    "apps/web/lib/local/teaching-plan.ts",
    '''    organization: "WHOLE",
    primaryTeacherId: "",''',
    '''    organization: "WHOLE",
    rotationPlacement: "SAME_DAY",
    primaryTeacherId: "",''',
)
replace_once(
    "apps/web/lib/local/teaching-plan.ts",
    '''export function rotationSummary(row: TeachingPlanRow): string {
  if (row.organization !== "ROTATION") return "";
  return `1. rameno: skupina 1 ${row.subjectCode} / skupina 2 ${row.secondarySubjectCode} → 2. rameno: skupina 1 ${row.secondarySubjectCode} / skupina 2 ${row.subjectCode}`;
}''',
    '''export function rotationPlacementLabel(
  placement: TeachingRotationPlacement | undefined,
): string {
  return (
    TEACHING_ROTATION_PLACEMENTS.find(
      (item) => item.value === (placement ?? "SAME_DAY"),
    )?.label ?? "Ve stejný den"
  );
}

export function rotationSummary(row: TeachingPlanRow): string {
  if (row.organization !== "ROTATION") return "";
  return `1. rameno: skupina 1 ${row.subjectCode} / skupina 2 ${row.secondarySubjectCode} → 2. rameno: skupina 1 ${row.secondarySubjectCode} / skupina 2 ${row.subjectCode} · ${rotationPlacementLabel(row.rotationPlacement)}`;
}''',
)
replace_once(
    "apps/web/lib/local/teaching-plan.ts",
    '''    if (row.subjectCode && row.subjectCode === row.secondarySubjectCode) {
      messages.push("Při výměně musí být zvoleny dva různé předměty.");
    }
  }''',
    '''    if (row.subjectCode && row.subjectCode === row.secondarySubjectCode) {
      messages.push("Při výměně musí být zvoleny dva různé předměty.");
    }
    if (
      !["ADJACENT", "SAME_DAY", "FLEXIBLE"].includes(
        String(row.rotationPlacement ?? "SAME_DAY"),
      )
    ) {
      messages.push("Vyberte, kdy se mají obě ramena výměny uskutečnit.");
    }
  }''',
)
replace_once(
    "apps/web/lib/local/teaching-plan.ts",
    '''          organization: ["WHOLE", "SPLIT", "ROTATION"].includes(
            String(item.organization),
          )
            ? (item.organization as TeachingOrganization)
            : "WHOLE",
          primaryTeacherId:''',
    '''          organization: ["WHOLE", "SPLIT", "ROTATION"].includes(
            String(item.organization),
          )
            ? (item.organization as TeachingOrganization)
            : "WHOLE",
          rotationPlacement: ["ADJACENT", "SAME_DAY", "FLEXIBLE"].includes(
            String(item.rotationPlacement),
          )
            ? (item.rotationPlacement as TeachingRotationPlacement)
            : "SAME_DAY",
          primaryTeacherId:''',
)

# ---------------------------------------------------------------------------
# UI: persist rotation mode and expose it as three simple cards.
# ---------------------------------------------------------------------------
replace_once(
    "apps/web/app/teaching-plan/page.tsx",
    '''  TEACHING_ORGANIZATIONS,
  TEACHING_SHAPES,''',
    '''  TEACHING_ORGANIZATIONS,
  TEACHING_ROTATION_PLACEMENTS,
  TEACHING_SHAPES,''',
)
replace_once(
    "apps/web/app/teaching-plan/page.tsx",
    '''  rotationSummary,
  rowClassPeriods,''',
    '''  rotationPlacementLabel,
  rotationSummary,
  rowClassPeriods,''',
)
replace_once(
    "apps/web/app/teaching-plan/page.tsx",
    '''        const leg1 = `${rotationKey}-L1`;
        const leg2 = `${rotationKey}-L2`;
        return [''',
    '''        const leg1 = `${rotationKey}-L1`;
        const leg2 = `${rotationKey}-L2`;
        const rotationPlacement = row.rotationPlacement ?? "SAME_DAY";
        return [''',
)
# Add the placement field to all four generated rotation assignments.
for marker in [
    '            rotationLeg: 1,\n          },',
    '            rotationLeg: 2,\n          },',
]:
    count_path = Path("apps/web/app/teaching-plan/page.tsx")
    content = count_path.read_text()
    occurrences = content.count(marker)
    if occurrences != 2:
        raise SystemExit(f"Expected two occurrences of {marker!r}, found {occurrences}")
    count_path.write_text(
        content.replace(
            marker,
            marker.replace("\n          },", "\n            rotationPlacement,\n          },"),
        )
    )
replace_once(
    "apps/web/app/teaching-plan/page.tsx",
    '''                      secondarySubjectCode:
                        organization.value === "ROTATION"
                          ? current.secondarySubjectCode
                          : "",
                    }))''',
    '''                      secondarySubjectCode:
                        organization.value === "ROTATION"
                          ? current.secondarySubjectCode
                          : "",
                      rotationPlacement:
                        organization.value === "ROTATION"
                          ? (current.rotationPlacement ?? "SAME_DAY")
                          : current.rotationPlacement,
                    }))''',
)
replace_once(
    "apps/web/app/teaching-plan/page.tsx",
    '''                  <p className="mt-1 text-sm leading-6 text-text-secondary">
                    Solver vytvoří obě ramena. Nemůže ponechat jednu skupinu bez
                    prohození. Ramena smí být i v různých časech nebo jedno
                    odpoledne, když to vyžaduje dostupnost učitelů.
                  </p>''',
    '''                  <p className="mt-1 text-sm leading-6 text-text-secondary">
                    Solver vytvoří obě ramena, přesně prohodí předměty i učitele
                    a sám smí otočit jejich pořadí podle dostupnosti.
                  </p>''',
)
replace_once(
    "apps/web/app/teaching-plan/page.tsx",
    '''              {row.subjectCode && row.secondarySubjectCode ? (
                <p className="mt-3 text-sm font-medium text-primary">
                  {rotationSummary(row)}
                </p>
              ) : null}''',
    '''              <div className="mt-5">
                <p className="text-sm font-semibold text-text-primary">
                  Kdy se mají skupiny vystřídat?
                </p>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  {TEACHING_ROTATION_PLACEMENTS.map((placement) => {
                    const selected =
                      (row.rotationPlacement ?? "SAME_DAY") === placement.value;
                    return (
                      <button
                        key={placement.value}
                        type="button"
                        aria-pressed={selected}
                        aria-label={placement.label}
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            rotationPlacement: placement.value,
                          }))
                        }
                        className={
                          selected
                            ? "rounded-xl border-2 border-primary bg-surface p-4 text-left"
                            : "rounded-xl border border-primary/30 bg-primary-subtle/40 p-4 text-left hover:border-primary"
                        }
                      >
                        <p className="font-semibold text-text-primary">
                          {placement.shortLabel}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-text-secondary">
                          {placement.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-sm font-medium text-primary">
                  Zvoleno: {rotationPlacementLabel(row.rotationPlacement)}
                </p>
              </div>
              {row.subjectCode && row.secondarySubjectCode ? (
                <p className="mt-3 text-sm font-medium text-primary">
                  {rotationSummary(row)}
                </p>
              ) : null}''',
)
replace_once(
    "apps/web/app/teaching-plan/page.tsx",
    '''                ? `${row.subjectCode} a ${row.secondarySubjectCode} se povinně prohodí`''',
    '''                ? `${row.subjectCode} a ${row.secondarySubjectCode} se povinně prohodí · ${rotationPlacementLabel(row.rotationPlacement)}`''',
)

# ---------------------------------------------------------------------------
# Excel: the same rotation timing choice is available in a dropdown.
# ---------------------------------------------------------------------------
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''  TEACHING_CLASS_PROFILES,
  TEACHING_SHAPES,''',
    '''  TEACHING_CLASS_PROFILES,
  TEACHING_ROTATION_PLACEMENTS,
  TEACHING_SHAPES,''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''  type TeachingLessonShape,
  type TeachingPlan,''',
    '''  type TeachingLessonShape,
  type TeachingPlan,
  type TeachingRotationPlacement,''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''const PROFILE_LABELS: Record<TeachingClassProfile, string> = {
  REGULAR: "Běžná třída",
  SPORTS: "Sportovní třída",
  CUSTOM: "Vlastní profil",
};''',
    '''const PROFILE_LABELS: Record<TeachingClassProfile, string> = {
  REGULAR: "Běžná třída",
  SPORTS: "Sportovní třída",
  CUSTOM: "Vlastní profil",
};

const ROTATION_PLACEMENT_LABELS: Record<TeachingRotationPlacement, string> = {
  ADJACENT: "Hned po sobě",
  SAME_DAY: "Ve stejný den",
  FLEXIBLE: "Kdykoliv během týdne",
};''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''  dictionary.getCell("L1").value = "Počet učitelů";
  dictionary.getCell("L2").value = staffingPlan.teachers.length;''',
    '''  dictionary.getCell("L1").value = "Počet učitelů";
  dictionary.getCell("L2").value = staffingPlan.teachers.length;
  dictionary.getCell("N1").value = "Režim výměny";
  TEACHING_ROTATION_PLACEMENTS.forEach((placement, index) => {
    dictionary.getCell(index + 2, 14).value = placement.label;
  });''',
)
for old, new in [
    ('styleTitle(rotations, "A1:J1"', 'styleTitle(rotations, "A1:K1"'),
    ('rotations.mergeCells("A2:J2")', 'rotations.mergeCells("A2:K2")'),
    ('rotations.mergeCells("A3:J3")', 'rotations.mergeCells("A3:K3")'),
    ('rotations.mergeCells("A4:J4")', 'rotations.mergeCells("A4:K4")'),
]:
    replace_once("apps/web/lib/import/teaching-plan-workbook.ts", old, new)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''    "Počet dvojhodin jen u kombinace",
    "Náhled výměny",
    "Kontrola",
  ];''',
    '''    "Počet dvojhodin jen u kombinace",
    "Kdy se mají skupiny vystřídat? *",
    "Náhled výměny",
    "Kontrola",
  ];''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''    { width: 20 },
    { width: 58 },
    { width: 24 },
  ];''',
    '''    { width: 20 },
    { width: 28 },
    { width: 58 },
    { width: 24 },
  ];''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''  addWholeNumberValidation(rotations, 8, ROTATION_FIRST_ROW, 1, 10);

  for (let row = ROTATION_FIRST_ROW;''',
    '''  addWholeNumberValidation(rotations, 8, ROTATION_FIRST_ROW, 1, 10);
  addListValidation(
    rotations,
    9,
    `'${DICTIONARY_SHEET}'!$N$2:$N$${TEACHING_ROTATION_PLACEMENTS.length + 1}`,
    ROTATION_FIRST_ROW,
  );

  for (let row = ROTATION_FIRST_ROW;''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''    rotations.getCell(row, 9).value = {
      formula: `IF(COUNTA(A${row}:H${row})=0,"","1. rameno: G1 "&B${row}&" / G2 "&D${row}&" → 2. rameno: G1 "&D${row}&" / G2 "&B${row})`,
      result: "",
    };
    rotations.getCell(row, 10).value = {
      formula: `IF(COUNTA(A${row}:H${row})=0,"",IF(OR(A${row}="",B${row}="",C${row}="",D${row}="",E${row}="",F${row}="",G${row}=""),"DOPLNIT",IF(B${row}=D${row},"STEJNÉ PŘEDMĚTY",IF(C${row}=E${row},"STEJNÝ UČITEL",IF(AND(G${row}="Pouze dvojhodiny",MOD(F${row},2)=1),"LICHÝ POČET",IF(AND(G${row}="Kombinace",OR(H${row}="",2*H${row}>=F${row})),"OPRAVIT KOMBINACI","SEDÍ")))))`,
      result: "",
    };
    rotations.getCell(row, 9).fill = {''',
    '''    rotations.getCell(row, 10).value = {
      formula: `IF(COUNTA(A${row}:I${row})=0,"","1. rameno: G1 "&B${row}&" / G2 "&D${row}&" → 2. rameno: G1 "&D${row}&" / G2 "&B${row}&" · "&I${row})`,
      result: "",
    };
    rotations.getCell(row, 11).value = {
      formula: `IF(COUNTA(A${row}:I${row})=0,"",IF(OR(A${row}="",B${row}="",C${row}="",D${row}="",E${row}="",F${row}="",G${row}="",I${row}=""),"DOPLNIT",IF(B${row}=D${row},"STEJNÉ PŘEDMĚTY",IF(C${row}=E${row},"STEJNÝ UČITEL",IF(AND(G${row}="Pouze dvojhodiny",MOD(F${row},2)=1),"LICHÝ POČET",IF(AND(G${row}="Kombinace",OR(H${row}="",2*H${row}>=F${row})),"OPRAVIT KOMBINACI","SEDÍ")))))`,
      result: "",
    };
    rotations.getCell(row, 10).fill = {''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''    rotations.getCell(row, 10).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.paleGreen },
    };
    rotations.getCell(row, 10).font = { bold: true };''',
    '''    rotations.getCell(row, 11).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.paleGreen },
    };
    rotations.getCell(row, 11).font = { bold: true };''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''      rotations.getCell(row, 8).value =
        item.lessonShape === "MIXED" ? item.doublePeriodsCount : null;
    });''',
    '''      rotations.getCell(row, 8).value =
        item.lessonShape === "MIXED" ? item.doublePeriodsCount : null;
      rotations.getCell(row, 9).value =
        ROTATION_PLACEMENT_LABELS[item.rotationPlacement ?? "SAME_DAY"];
    });''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''function classProfileFromLabel(
  value: string,
  code: string,
): TeachingClassProfile {''',
    '''function rotationPlacementFromLabel(
  value: string,
): TeachingRotationPlacement | null {
  const normalized = value.trim().toLocaleLowerCase("cs-CZ");
  const match = Object.entries(ROTATION_PLACEMENT_LABELS).find(
    ([placement, label]) =>
      normalized === label.toLocaleLowerCase("cs-CZ") ||
      normalized === placement.toLocaleLowerCase("cs-CZ"),
  );
  return (match?.[0] as TeachingRotationPlacement | undefined) ?? null;
}

function classProfileFromLabel(
  value: string,
  code: string,
): TeachingClassProfile {''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''      const values = Array.from({ length: 8 }, (_, index) =>
        cellText(rotationsSheet.getCell(row, index + 1)),
      );''',
    '''      const values = Array.from({ length: 9 }, (_, index) =>
        cellText(rotationsSheet.getCell(row, index + 1)),
      );''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''        rawShape,
        rawDoubleCount,
      ] = values;''',
    '''        rawShape,
        rawDoubleCount,
        rawRotationPlacement,
      ] = values;''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''      const lessonShape = lessonShapeFromLabel(rawShape!);

      if (!seenClasses.has(classCode)) {''',
    '''      const lessonShape = lessonShapeFromLabel(rawShape!);
      const rotationPlacement = rotationPlacementFromLabel(
        rawRotationPlacement!,
      );

      if (!seenClasses.has(classCode)) {''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''      if (!lessonShape) {
        issue(
          issues,
          TEACHING_ROTATIONS_SHEET,
          row,
          "Rozložení",
          "Vyberte rozložení hodin ze seznamu.",
        );
      }

      plan.rows.push({''',
    '''      if (!lessonShape) {
        issue(
          issues,
          TEACHING_ROTATIONS_SHEET,
          row,
          "Rozložení",
          "Vyberte rozložení hodin ze seznamu.",
        );
      }
      if (!rotationPlacement) {
        issue(
          issues,
          TEACHING_ROTATIONS_SHEET,
          row,
          "Kdy se mají skupiny vystřídat?",
          "Vyberte režim výměny ze seznamu.",
        );
      }

      plan.rows.push({''',
)
replace_once(
    "apps/web/lib/import/teaching-plan-workbook.ts",
    '''        organization: "ROTATION",
        primaryTeacherId,''',
    '''        organization: "ROTATION",
        rotationPlacement: rotationPlacement ?? "SAME_DAY",
        primaryTeacherId,''',
)

# ---------------------------------------------------------------------------
# Review pages: show the chosen mode and correctly label exchange rows.
# ---------------------------------------------------------------------------
replace_once(
    "apps/web/app/teaching-plan/review/page.tsx",
    '''  rotationSummary,
  rowClassPeriods,''',
    '''  rotationPlacementLabel,
  rotationSummary,
  rowClassPeriods,''',
)
replace_once(
    "apps/web/app/teaching-plan/review/page.tsx",
    '''                    {row.organization === "SPLIT"
                      ? "Dvě skupiny současně"
                      : "Celá třída"}''',
    '''                    {row.organization === "SPLIT"
                      ? "Dvě skupiny současně"
                      : row.organization === "ROTATION"
                        ? `Výměna · ${rotationPlacementLabel(row.rotationPlacement)}`
                        : "Celá třída"}''',
)
replace_once(
    "apps/web/app/teaching-plan/review/page.tsx",
    '''                  {row.organization === "SPLIT" ? "Dvě skupiny" : "Celá třída"}''',
    '''                  {row.organization === "SPLIT"
                    ? "Dvě skupiny"
                    : row.organization === "ROTATION"
                      ? "Výměna předmětů"
                      : "Celá třída"}''',
)
replace_once(
    "apps/web/app/teaching-plan/review/page.tsx",
    '''                    {row.weeklyPeriods} h · {humanBlockSummary(row)}''',
    '''                    {row.weeklyPeriods} h · {humanBlockSummary(row)}
                    {row.organization === "ROTATION"
                      ? ` · ${rotationPlacementLabel(row.rotationPlacement)}`
                      : ""}''',
)
replace_once(
    "apps/web/app/teaching-plan/review/page.tsx",
    '''          Dělení a dvojhodiny souhlasí''',
    '''          Dělení, dvojhodiny a výměny souhlasí''',
)

# Documentation must describe the actual selectable behavior, not a soft-only rule.
Path("docs/24-synchronized-subject-rotations.md").write_text(
    '''# Synchronizované výměny předmětů

Výměna předmětů mezi dvěma skupinami je jedna atomická organizace výuky se dvěma rameny.

Příklad ČJ/M:

- rameno 1: skupina 1 má ČJ a skupina 2 má M;
- rameno 2: skupina 1 má M a skupina 2 má ČJ.

Obě poloviny každého ramene musí začít současně. Solver vždy vytvoří obě ramena, přesně prohodí předměty i učitele a smí automaticky otočit pořadí ramen podle dostupnosti.

Uživatel vybírá jeden ze tří režimů:

1. `ADJACENT` — ramena jsou bezprostředně za sebou a nesmějí být rozdělena obědovou přestávkou;
2. `SAME_DAY` — obě ramena proběhnou ve stejný den, klidně jedno ráno a druhé odpoledne;
3. `FLEXIBLE` — ramena mohou být i v různých dnech, ale optimalizace je stále drží co nejblíže.

Třídy mají profil `REGULAR`, `SPORTS` nebo `CUSTOM`. Pro tuto školu se označení končící `.B` nebo `.D` pouze nabízí jako sportovní profil. Skutečná hodinová dotace zůstává explicitně uložená po jednotlivých třídách, takže například 6.A a 6.B mohou mít odlišný počet matematiky, tělesné výchovy i dalších předmětů bez skrytého kopírování.
'''
)
