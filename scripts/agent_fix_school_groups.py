from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def replace(path: str, old: str, new: str, *, count: int = 1) -> None:
    text = read(path)
    actual = text.count(old)
    if actual < count:
        raise RuntimeError(f"{path}: expected at least {count} occurrence(s), found {actual}: {old[:120]!r}")
    write(path, text.replace(old, new, count))


# 1) Project deletion must clear every browser-owned working key, not only IndexedDB.
replace(
    "apps/web/lib/local/project-share.ts",
    '  getLocalProject,\n  replaceLocalProjectAtomically,\n  type LocalProject,\n',
    '  getLocalProject,\n  replaceLocalProjectAtomically,\n  resetLocalProject,\n  type LocalProject,\n',
)
replace(
    "apps/web/lib/local/project-share.ts",
    '''export const BROWSER_PROJECT_LOCAL_STORAGE_KEYS = [\n  "rozvrhar:staffing-plan:v1",\n  "rozvrhar:teaching-plan:v1",\n  "rozvrhar:staffing-allocation-draft:v1",\n  "rozvrhar:school-curriculum:v1",\n  "rozvrhar:teaching-plan-workload-credits:v1",\n] as const;\n''',
    '''export const BROWSER_PROJECT_LOCAL_STORAGE_KEYS = [\n  "rozvrhar:staffing-plan:v1",\n  "rozvrhar:teaching-plan:v1",\n  "rozvrhar:staffing-allocation-draft:v1",\n  "rozvrhar:school-curriculum:v1",\n  "rozvrhar:teaching-plan-workload-credits:v1",\n  "rozvrhar:teaching-plan-allocation-draft-applied:v1",\n  "rozvrhar:teaching-plan-shared:v1",\n  "rozvrhar:teaching-plan-split-periods:v1",\n] as const;\n\nexport const BROWSER_PROJECT_SESSION_STORAGE_KEYS = [\n  "rozvrhar:teaching-plan-import-review:v1",\n] as const;\n''',
)
replace(
    "apps/web/lib/local/project-share.ts",
    '''export async function applyBrowserProjectShare(\n  envelope: BrowserProjectShareEnvelope,\n): Promise<void> {\n''',
    '''function dispatchBrowserProjectWorkingDataChanged(): void {\n  if (typeof window === "undefined") return;\n  window.dispatchEvent(new Event("rozvrhar:staffing-plan-changed"));\n  window.dispatchEvent(new Event("rozvrhar:teaching-plan-changed"));\n}\n\nexport async function resetBrowserProject(): Promise<LocalProject> {\n  if (typeof window === "undefined") {\n    throw new Error("Projekt lze vymazat pouze v prohlížeči.");\n  }\n\n  const previousProject = await getLocalProject();\n  const previousLocalStorage = Object.fromEntries(\n    BROWSER_PROJECT_LOCAL_STORAGE_KEYS.map((key) => [\n      key,\n      window.localStorage.getItem(key),\n    ]),\n  );\n  const previousSessionStorage = Object.fromEntries(\n    BROWSER_PROJECT_SESSION_STORAGE_KEYS.map((key) => [\n      key,\n      window.sessionStorage.getItem(key),\n    ]),\n  );\n\n  try {\n    for (const key of BROWSER_PROJECT_LOCAL_STORAGE_KEYS) {\n      window.localStorage.removeItem(key);\n    }\n    for (const key of BROWSER_PROJECT_SESSION_STORAGE_KEYS) {\n      window.sessionStorage.removeItem(key);\n    }\n    const project = await resetLocalProject();\n    dispatchBrowserProjectWorkingDataChanged();\n    return project;\n  } catch (cause) {\n    for (const key of BROWSER_PROJECT_LOCAL_STORAGE_KEYS) {\n      const value = previousLocalStorage[key];\n      if (value === null) window.localStorage.removeItem(key);\n      else window.localStorage.setItem(key, value);\n    }\n    for (const key of BROWSER_PROJECT_SESSION_STORAGE_KEYS) {\n      const value = previousSessionStorage[key];\n      if (value === null) window.sessionStorage.removeItem(key);\n      else window.sessionStorage.setItem(key, value);\n    }\n    await replaceLocalProjectAtomically(previousProject);\n    dispatchBrowserProjectWorkingDataChanged();\n    throw cause;\n  }\n}\n\nexport async function applyBrowserProjectShare(\n  envelope: BrowserProjectShareEnvelope,\n): Promise<void> {\n''',
)
replace(
    "apps/web/lib/local/project-share.ts",
    '''  window.dispatchEvent(new Event("rozvrhar:staffing-plan-changed"));\n  window.dispatchEvent(new Event("rozvrhar:teaching-plan-changed"));\n}\n''',
    '''  dispatchBrowserProjectWorkingDataChanged();\n}\n''',
)
replace(
    "apps/web/app/settings/page.tsx",
    '''  getLocalProject,\n  resetLocalProject,\n  subscribeLocalProject,\n''',
    '''  getLocalProject,\n  subscribeLocalProject,\n''',
)
replace(
    "apps/web/app/settings/page.tsx",
    '''  captureBrowserProjectShare,\n  readBrowserProjectShareFile,\n} from "@/lib/local/project-share";\n''',
    '''  captureBrowserProjectShare,\n  readBrowserProjectShareFile,\n  resetBrowserProject,\n} from "@/lib/local/project-share";\n''',
)
replace(
    "apps/web/app/settings/page.tsx",
    "      const empty = await resetLocalProject();\n",
    "      const empty = await resetBrowserProject();\n",
)

# 2) Teaching plan supports a third parallel group where explicitly required (JAZ1 only in this school flow).
replace(
    "apps/web/lib/local/teaching-plan.ts",
    '''  primaryTeacherId: string;\n  secondaryTeacherId: string;\n}\n''',
    '''  primaryTeacherId: string;\n  secondaryTeacherId: string;\n  tertiaryTeacherId?: string;\n  splitGroupCount?: 2 | 3;\n}\n''',
)
replace(
    "apps/web/lib/local/teaching-plan.ts",
    '''    primaryTeacherId: "",\n    secondaryTeacherId: "",\n  };\n''',
    '''    primaryTeacherId: "",\n    secondaryTeacherId: "",\n    tertiaryTeacherId: "",\n    splitGroupCount: 2,\n  };\n''',
)
replace(
    "apps/web/lib/local/teaching-plan.ts",
    '''  if (row.organization === "SPLIT" && row.secondaryTeacherId === teacherId) {\n    return row.weeklyPeriods;\n  }\n  return 0;\n}\n''',
    '''  if (row.organization === "SPLIT" && row.secondaryTeacherId === teacherId) {\n    return row.weeklyPeriods;\n  }\n  if (\n    row.organization === "SPLIT" &&\n    row.splitGroupCount === 3 &&\n    row.tertiaryTeacherId === teacherId\n  ) {\n    return row.weeklyPeriods;\n  }\n  return 0;\n}\n''',
)
replace(
    "apps/web/lib/local/teaching-plan.ts",
    '''    if (\n      row.primaryTeacherId &&\n      row.primaryTeacherId === row.secondaryTeacherId\n    ) {\n      messages.push(\n        row.organization === "ROTATION"\n          ? "Dva různé předměty musí mít dva různé učitele."\n          : "Každá skupina musí mít jiného učitele.",\n      );\n    }\n  }\n\n  return {\n''',
    '''    if (\n      row.primaryTeacherId &&\n      row.primaryTeacherId === row.secondaryTeacherId\n    ) {\n      messages.push(\n        row.organization === "ROTATION"\n          ? "Dva různé předměty musí mít dva různé učitele."\n          : "Každá skupina musí mít jiného učitele.",\n      );\n    }\n    if (row.organization === "SPLIT" && row.splitGroupCount === 3) {\n      if (!row.tertiaryTeacherId || !teacherIds.has(row.tertiaryTeacherId)) {\n        messages.push("Vyberte učitele třetí skupiny.");\n      }\n      if (\n        row.tertiaryTeacherId &&\n        [row.primaryTeacherId, row.secondaryTeacherId].includes(\n          row.tertiaryTeacherId,\n        )\n      ) {\n        messages.push("Každá ze tří skupin musí mít jiného učitele.");\n      }\n    }\n  }\n\n  return {\n''',
)
replace(
    "apps/web/lib/local/teaching-plan.ts",
    '''          secondaryTeacherId:\n            typeof item.secondaryTeacherId === "string"\n              ? item.secondaryTeacherId\n              : "",\n        }))\n''',
    '''          secondaryTeacherId:\n            typeof item.secondaryTeacherId === "string"\n              ? item.secondaryTeacherId\n              : "",\n          tertiaryTeacherId:\n            typeof item.tertiaryTeacherId === "string"\n              ? item.tertiaryTeacherId\n              : "",\n          splitGroupCount: item.splitGroupCount === 3 ? 3 : 2,\n        }))\n''',
)

# 3) School rules: 8.B INF is a solo whole-class lesson; AJ may preserve 3 imported groups; TV never becomes 3 groups.
replace(
    "apps/web/lib/local/teaching-plan-school-v3.ts",
    '''export function isSameTeacherPartialSplit(row: TeachingPlanRow): boolean {\n  if (\n    row.organization !== "SPLIT" ||\n''',
    '''export function isSameTeacherPartialSplit(row: TeachingPlanRow): boolean {\n  if (\n    row.organization !== "SPLIT" ||\n    (row.splitGroupCount ?? 2) !== 2 ||\n''',
)
replace(
    "apps/web/lib/local/teaching-plan-school-v3.ts",
    '''      if (\n        row.organization === "ROTATION" ||\n        !SCHOOL_SPLIT_SUBJECT_CODES.has(row.subjectCode)\n      ) {\n        return row;\n      }\n\n      const singleSplit = SCHOOL_SINGLE_SPLIT_PERIOD_SUBJECT_CODES.has(\n        row.subjectCode,\n      );\n      return {\n        ...row,\n        organization: "SPLIT" as const,\n        splitWeeklyPeriods: singleSplit ? 1 : row.weeklyPeriods,\n        secondaryTeacherId: singleSplit\n          ? row.primaryTeacherId\n          : row.secondaryTeacherId,\n        additionalClassCodes:\n          row.subjectCode === "TV" ? [] : row.additionalClassCodes,\n        sharedGroupLabel: row.subjectCode === "TV" ? "" : row.sharedGroupLabel,\n      };\n''',
    '''      if (\n        row.organization === "ROTATION" ||\n        !SCHOOL_SPLIT_SUBJECT_CODES.has(row.subjectCode)\n      ) {\n        return row;\n      }\n\n      if (normalizeClassCode(row.classCode) === "8.B" && row.subjectCode === "INF") {\n        return {\n          ...row,\n          organization: "WHOLE" as const,\n          splitWeeklyPeriods: undefined,\n          secondaryTeacherId: "",\n          tertiaryTeacherId: "",\n          splitGroupCount: 2,\n        };\n      }\n\n      const singleSplit = SCHOOL_SINGLE_SPLIT_PERIOD_SUBJECT_CODES.has(\n        row.subjectCode,\n      );\n      const splitGroupCount =\n        !singleSplit && row.subjectCode === "JAZ1" && row.splitGroupCount === 3\n          ? 3\n          : 2;\n      return {\n        ...row,\n        organization: "SPLIT" as const,\n        splitWeeklyPeriods: singleSplit ? 1 : row.weeklyPeriods,\n        secondaryTeacherId: singleSplit\n          ? row.primaryTeacherId\n          : row.secondaryTeacherId,\n        tertiaryTeacherId:\n          splitGroupCount === 3 ? row.tertiaryTeacherId : "",\n        splitGroupCount,\n        additionalClassCodes:\n          row.subjectCode === "TV" ? [] : row.additionalClassCodes,\n        sharedGroupLabel: row.subjectCode === "TV" ? "" : row.sharedGroupLabel,\n      };\n''',
)

# 4) Import model can represent GROUP_3, and compact legacy Excel uses 3 teachers for AJ but caps TV at 2 active groups.
replace(
    "apps/web/lib/local/staffing-allocation-draft.ts",
    'export type StaffingAllocationGroup = "WHOLE" | "GROUP_1" | "GROUP_2";\n',
    'export type StaffingAllocationGroup =\n  | "WHOLE"\n  | "GROUP_1"\n  | "GROUP_2"\n  | "GROUP_3";\n',
)
replace(
    "apps/web/lib/local/staffing-allocation-draft.ts",
    '''      !["WHOLE", "GROUP_1", "GROUP_2"].includes(String(item.group)) ||\n''',
    '''      !["WHOLE", "GROUP_1", "GROUP_2", "GROUP_3"].includes(\n        String(item.group),\n      ) ||\n''',
)
replace(
    "apps/web/lib/import/legacy-staffing-plan.ts",
    '''  for (const requirement of parsed.requirements) {\n    const tokens = teacherTokens(requirement.rawTeacher).slice(0, 2);\n    const resolved = tokens.flatMap((token) => {\n      const teacher = resolveTeacher(token, requirement.row);\n      return teacher ? [teacher] : [];\n    });\n''',
    '''  for (const requirement of parsed.requirements) {\n    const allTokens = teacherTokens(requirement.rawTeacher);\n    const activeTeacherLimit = requirement.subject.code === "JAZ1" ? 3 : 2;\n    const allResolved = allTokens.flatMap((token) => {\n      const teacher = resolveTeacher(token, requirement.row);\n      return teacher ? [teacher] : [];\n    });\n    const resolved = allResolved.slice(0, activeTeacherLimit);\n    const tokens = allTokens.slice(0, activeTeacherLimit);\n''',
)
replace(
    "apps/web/lib/import/legacy-staffing-plan.ts",
    '''    if (teacherTokens(requirement.rawTeacher).length > 2) {\n      issues.push(\n        issue(\n          "WARNING",\n          requirement.row,\n          "Učitel/učitelka",\n          `${requirement.classCode} · ${requirement.subject.name}: zachováni byli první dva souběžní učitelé; další je potřeba zkontrolovat ručně.`,\n        ),\n      );\n    }\n''',
    '''    if (allTokens.length > activeTeacherLimit) {\n      issues.push(\n        issue(\n          "WARNING",\n          requirement.row,\n          "Učitel/učitelka",\n          requirement.subject.code === "TV"\n            ? `${requirement.classCode} · ${requirement.subject.name}: TV zůstává rozdělená jen na dvě žákovské skupiny. První dva učitelé byli nastaveni a další zůstávají v seznamu pro ruční změnu obsazení.`\n            : `${requirement.classCode} · ${requirement.subject.name}: zachováni byli první ${activeTeacherLimit} souběžní učitelé; další je potřeba zkontrolovat ručně.`,\n        ),\n      );\n    }\n''',
)
replace(
    "apps/web/lib/local/teaching-plan-from-allocation-draft.ts",
    '''    const group1 = rows.find((row) => row.group === "GROUP_1");\n    const group2 = rows.find((row) => row.group === "GROUP_2");\n    const whole = rows.find((row) => row.group === "WHOLE");\n    const allTeacherIds = uniqueTeacherIds(rows);\n    const explicitGroups = rows.filter((row) => row.group !== "WHOLE").length;\n    const split = explicitGroups >= 2 || allTeacherIds.length >= 2;\n''',
    '''    const group1 = rows.find((row) => row.group === "GROUP_1");\n    const group2 = rows.find((row) => row.group === "GROUP_2");\n    const group3 = rows.find((row) => row.group === "GROUP_3");\n    const whole = rows.find((row) => row.group === "WHOLE");\n    const allTeacherIds = uniqueTeacherIds(rows);\n    const explicitGroups = rows.filter((row) => row.group !== "WHOLE").length;\n    const threeGroups =\n      subjectCode === "JAZ1" &&\n      (Boolean(group3) || allTeacherIds.length >= 3);\n    const split = explicitGroups >= 2 || allTeacherIds.length >= 2;\n''',
)
replace(
    "apps/web/lib/local/teaching-plan-from-allocation-draft.ts",
    '''    const secondaryTeacherId = group2\n      ? (group2.teacherIds[0] ?? "")\n      : (allTeacherIds.find((teacherId) => teacherId !== primaryTeacherId) ??\n        "");\n\n    const row = school.createTeachingPlanRow(classCode, subjectCode);\n    row.weeklyPeriods = weeklyPeriods(rows);\n    row.organization = split ? "SPLIT" : "WHOLE";\n    row.primaryTeacherId = primaryTeacherId;\n    row.secondaryTeacherId = split ? secondaryTeacherId : "";\n    plan.rows.push(row);\n''',
    '''    const secondaryTeacherId = group2\n      ? (group2.teacherIds[0] ?? "")\n      : (allTeacherIds.find((teacherId) => teacherId !== primaryTeacherId) ??\n        "");\n    const tertiaryTeacherId = group3\n      ? (group3.teacherIds[0] ?? "")\n      : (allTeacherIds.find(\n          (teacherId) =>\n            teacherId !== primaryTeacherId && teacherId !== secondaryTeacherId,\n        ) ?? "");\n\n    const row = school.createTeachingPlanRow(classCode, subjectCode);\n    row.weeklyPeriods = weeklyPeriods(rows);\n    row.organization = split ? "SPLIT" : "WHOLE";\n    row.primaryTeacherId = primaryTeacherId;\n    row.secondaryTeacherId = split ? secondaryTeacherId : "";\n    row.tertiaryTeacherId = split && threeGroups ? tertiaryTeacherId : "";\n    row.splitGroupCount = split && threeGroups ? 3 : 2;\n    plan.rows.push(row);\n''',
)

# 5) Generation and coverage carry GROUP_3 all the way to solver input.
replace(
    "apps/web/lib/local/api.ts",
    '  group: "WHOLE" | "GROUP_1" | "GROUP_2";\n',
    '  group: "WHOLE" | "GROUP_1" | "GROUP_2" | "GROUP_3";\n',
)
replace(
    "apps/web/lib/domain/contracts.ts",
    'export type TeachingGroup = "WHOLE" | "GROUP_1" | "GROUP_2";\n',
    'export type TeachingGroup =\n  | "WHOLE"\n  | "GROUP_1"\n  | "GROUP_2"\n  | "GROUP_3";\n',
)
replace(
    "apps/web/lib/local/school-project-generation.ts",
    '''  if (row.secondaryTeacherId === teacherId) {\n    return splitWeeklyPeriodsForRow(row);\n  }\n  return 0;\n}\n''',
    '''  if (row.secondaryTeacherId === teacherId) {\n    return splitWeeklyPeriodsForRow(row);\n  }\n  if (\n    row.splitGroupCount === 3 &&\n    row.tertiaryTeacherId === teacherId\n  ) {\n    return splitWeeklyPeriodsForRow(row);\n  }\n  return 0;\n}\n''',
)
replace(
    "apps/web/lib/local/school-project-generation.ts",
    '''      push(\n        row,\n        "G2",\n        row.subjectCode,\n        row.secondaryTeacherId,\n        "GROUP_2",\n        rowKey,\n        null,\n        null,\n        splitWeeklyPeriods,\n      );\n    } else {\n''',
    '''      push(\n        row,\n        "G2",\n        row.subjectCode,\n        row.secondaryTeacherId,\n        "GROUP_2",\n        rowKey,\n        null,\n        null,\n        splitWeeklyPeriods,\n      );\n      if (row.splitGroupCount === 3) {\n        push(\n          row,\n          "G3",\n          row.subjectCode,\n          row.tertiaryTeacherId ?? "",\n          "GROUP_3",\n          rowKey,\n          null,\n          null,\n          splitWeeklyPeriods,\n        );\n      }\n    } else {\n''',
)
replace(
    "apps/web/lib/domain/coverage-overview.ts",
    '''    return [\n      {\n        subjectCode: row.subjectCode,\n        roleLabel:\n          wholePeriods > 0\n            ? "hlavní učitel celé třídy + 1. skupiny"\n            : "učitel 1. skupiny",\n        teacherId: row.primaryTeacherId,\n        teacherHours: periods,\n        classPeriods: wholePeriods + splitPeriods / 2,\n      },\n      {\n        subjectCode: row.subjectCode,\n        roleLabel:\n          wholePeriods > 0\n            ? `učitel 2. skupiny (${splitPeriods} h týdně)`\n            : "učitel 2. skupiny",\n        teacherId: row.secondaryTeacherId,\n        teacherHours: splitPeriods,\n        classPeriods: splitPeriods / 2,\n      },\n    ];\n''',
    '''    const groupCount = row.splitGroupCount === 3 ? 3 : 2;\n    const groupClassPeriods = splitPeriods / groupCount;\n    return [\n      {\n        subjectCode: row.subjectCode,\n        roleLabel:\n          wholePeriods > 0\n            ? "hlavní učitel celé třídy + 1. skupiny"\n            : "učitel 1. skupiny",\n        teacherId: row.primaryTeacherId,\n        teacherHours: periods,\n        classPeriods: wholePeriods + groupClassPeriods,\n      },\n      {\n        subjectCode: row.subjectCode,\n        roleLabel:\n          wholePeriods > 0\n            ? `učitel 2. skupiny (${splitPeriods} h týdně)`\n            : "učitel 2. skupiny",\n        teacherId: row.secondaryTeacherId,\n        teacherHours: splitPeriods,\n        classPeriods: groupClassPeriods,\n      },\n      ...(groupCount === 3\n        ? [\n            {\n              subjectCode: row.subjectCode,\n              roleLabel: "učitel 3. skupiny",\n              teacherId: row.tertiaryTeacherId ?? "",\n              teacherHours: splitPeriods,\n              classPeriods: groupClassPeriods,\n            },\n          ]\n        : []),\n    ];\n''',
)

# 6) Generic parallel groups in web domain (2 or 3), while rotations stay exactly 2 groups.
write(
    "apps/web/lib/domain/class-groups.ts",
    '''import type {\n  ScheduledLesson,\n  SnapshotAssignment,\n  TeachingGroup,\n} from "./contracts";\n\nconst PARALLEL_GROUP_ORDER: Array<Exclude<TeachingGroup, "WHOLE">> = [\n  "GROUP_1",\n  "GROUP_2",\n  "GROUP_3",\n];\n\nexport function assignmentClassIds(assignment: SnapshotAssignment): string[] {\n  return [\n    ...new Set([\n      assignment.class_id,\n      ...(assignment.additional_class_ids ?? []),\n    ]),\n  ];\n}\n\nexport function lessonClassIds(lesson: ScheduledLesson): string[] {\n  return [\n    ...new Set([lesson.class_id, ...(lesson.additional_class_ids ?? [])]),\n  ];\n}\n\nfunction parallelKey(assignment: SnapshotAssignment): string {\n  if (assignment.parallel_key) return assignment.parallel_key;\n\n  const normalizedId = assignment.id.toLocaleLowerCase("cs-CZ");\n  if (normalizedId.includes("-rot-") || normalizedId.includes("-rotation-")) {\n    return `rotation-id:${normalizedId.replace(/-(g1|g2)$/i, "")}`;\n  }\n  return `subject:${assignment.subject_id}`;\n}\n\nexport function parallelAssignmentGroups(\n  assignments: SnapshotAssignment[],\n): SnapshotAssignment[][] {\n  const grouped = new Map<\n    string,\n    Partial<Record<Exclude<TeachingGroup, "WHOLE">, SnapshotAssignment[]>>\n  >();\n\n  for (const assignment of assignments) {\n    if (assignment.group === "WHOLE") continue;\n    const key = `${assignmentClassIds(assignment).sort().join("|")}::${parallelKey(assignment)}`;\n    const groups = grouped.get(key) ?? {};\n    const current = groups[assignment.group] ?? [];\n    groups[assignment.group] = [...current, assignment];\n    grouped.set(key, groups);\n  }\n\n  return [...grouped.values()].flatMap((groups) => {\n    const present = PARALLEL_GROUP_ORDER.flatMap((group) => {\n      const items = [...(groups[group] ?? [])].sort((a, b) =>\n        a.id.localeCompare(b.id),\n      );\n      return items.length === 1 ? [items[0]!] : [];\n    });\n    const rawCount = PARALLEL_GROUP_ORDER.reduce(\n      (total, group) => total + (groups[group]?.length ?? 0),\n      0,\n    );\n    return present.length >= 2 && present.length === rawCount ? [present] : [];\n  });\n}\n\nexport function parallelAssignmentPairs(\n  assignments: SnapshotAssignment[],\n): Array<[SnapshotAssignment, SnapshotAssignment]> {\n  return parallelAssignmentGroups(assignments).flatMap((group) =>\n    group.length === 2 &&\n    group[0]?.group === "GROUP_1" &&\n    group[1]?.group === "GROUP_2"\n      ? [[group[0], group[1]] as [SnapshotAssignment, SnapshotAssignment]]\n      : [],\n  );\n}\n\nexport function rotationAssignmentLegs(\n  assignments: SnapshotAssignment[],\n): Array<{\n  rotationKey: string;\n  leg1: [SnapshotAssignment, SnapshotAssignment];\n  leg2: [SnapshotAssignment, SnapshotAssignment];\n}> {\n  const rotations = new Map<\n    string,\n    Partial<Record<1 | 2, [SnapshotAssignment, SnapshotAssignment]>>\n  >();\n\n  for (const pair of parallelAssignmentPairs(assignments)) {\n    const [left, right] = pair;\n    if (\n      !left.rotation_key ||\n      left.rotation_key !== right.rotation_key ||\n      left.rotation_leg == null ||\n      left.rotation_leg !== right.rotation_leg\n    ) {\n      continue;\n    }\n    const leg = left.rotation_leg as 1 | 2;\n    const current = rotations.get(left.rotation_key) ?? {};\n    current[leg] = pair;\n    rotations.set(left.rotation_key, current);\n  }\n\n  return [...rotations.entries()]\n    .filter(\n      (\n        entry,\n      ): entry is [\n        string,\n        {\n          1: [SnapshotAssignment, SnapshotAssignment];\n          2: [SnapshotAssignment, SnapshotAssignment];\n        },\n      ] => Boolean(entry[1][1] && entry[1][2]),\n    )\n    .sort(([left], [right]) => left.localeCompare(right))\n    .map(([rotationKey, legs]) => ({\n      rotationKey,\n      leg1: legs[1],\n      leg2: legs[2],\n    }));\n}\n\nexport function classRequiredWeeklyPeriods(\n  assignments: SnapshotAssignment[],\n): Map<string, number> {\n  const totals = new Map<string, number>();\n  const groupedIds = new Set<string>();\n\n  for (const group of parallelAssignmentGroups(assignments)) {\n    group.forEach((assignment) => groupedIds.add(assignment.id));\n    const weeklyPeriods = Math.max(...group.map((item) => item.weekly_periods));\n    for (const classId of assignmentClassIds(group[0]!)) {\n      totals.set(classId, (totals.get(classId) ?? 0) + weeklyPeriods);\n    }\n  }\n\n  for (const assignment of assignments) {\n    if (groupedIds.has(assignment.id)) continue;\n    for (const classId of assignmentClassIds(assignment)) {\n      totals.set(\n        classId,\n        (totals.get(classId) ?? 0) + assignment.weekly_periods,\n      );\n    }\n  }\n\n  return totals;\n}\n''',
)
replace(
    "apps/web/lib/domain/validation.ts",
    '''  classRequiredWeeklyPeriods,\n  lessonClassIds,\n  parallelAssignmentPairs,\n} from "./class-groups";\n''',
    '''  classRequiredWeeklyPeriods,\n  lessonClassIds,\n  parallelAssignmentGroups,\n} from "./class-groups";\n''',
)
replace(
    "apps/web/lib/domain/validation.ts",
    '''  for (const [left, right] of parallelAssignmentPairs(snapshot.assignments)) {\n    const leftLessons = [...(lessonsByAssignment.get(left.id) ?? [])].sort(\n      (a, b) => a.block_id.localeCompare(b.block_id),\n    );\n    const rightLessons = [...(lessonsByAssignment.get(right.id) ?? [])].sort(\n      (a, b) => a.block_id.localeCompare(b.block_id),\n    );\n    if (leftLessons.length !== rightLessons.length) continue;\n    leftLessons.forEach((leftLesson, index) => {\n      const rightLesson = rightLessons[index]!;\n      if (\n        leftLesson.day !== rightLesson.day ||\n        leftLesson.period !== rightLesson.period ||\n        leftLesson.duration !== rightLesson.duration\n      ) {\n        pushIssue(\n          issues,\n          "PARALLEL_GROUP_DESYNCHRONIZED",\n          "Obě poloviny dělené výuky musí probíhat současně.",\n          [leftLesson.block_id, rightLesson.block_id],\n          leftLesson.day,\n          leftLesson.period,\n        );\n      }\n    });\n  }\n''',
    '''  for (const group of parallelAssignmentGroups(snapshot.assignments)) {\n    const lessonGroups = group.map((assignment) =>\n      [...(lessonsByAssignment.get(assignment.id) ?? [])].sort((a, b) =>\n        a.block_id.localeCompare(b.block_id),\n      ),\n    );\n    const expectedLength = lessonGroups[0]?.length ?? 0;\n    if (lessonGroups.some((items) => items.length !== expectedLength)) continue;\n    for (let index = 0; index < expectedLength; index += 1) {\n      const reference = lessonGroups[0]![index]!;\n      for (const candidateGroup of lessonGroups.slice(1)) {\n        const candidate = candidateGroup[index]!;\n        if (\n          reference.day !== candidate.day ||\n          reference.period !== candidate.period ||\n          reference.duration !== candidate.duration\n        ) {\n          pushIssue(\n            issues,\n            "PARALLEL_GROUP_DESYNCHRONIZED",\n            "Všechny paralelní skupiny dělené výuky musí probíhat současně.",\n            [reference.block_id, candidate.block_id],\n            reference.day,\n            reference.period,\n          );\n        }\n      }\n    }\n  }\n''',
)

# 7) Solver model and constraints support GROUP_3, but rotations remain two-group swaps.
replace(
    "apps/solver/app/models.py",
    '''class TeachingGroup(StrEnum):\n    WHOLE = "WHOLE"\n    GROUP_1 = "GROUP_1"\n    GROUP_2 = "GROUP_2"\n''',
    '''class TeachingGroup(StrEnum):\n    WHOLE = "WHOLE"\n    GROUP_1 = "GROUP_1"\n    GROUP_2 = "GROUP_2"\n    GROUP_3 = "GROUP_3"\n''',
)
write(
    "apps/solver/app/class_groups.py",
    '''import re\nfrom collections import defaultdict\n\nfrom app.models import Assignment, ScheduledLesson, TeachingGroup\n\n\nPARALLEL_GROUP_ORDER = (\n    TeachingGroup.GROUP_1,\n    TeachingGroup.GROUP_2,\n    TeachingGroup.GROUP_3,\n)\n\n\ndef assignment_class_ids(assignment: Assignment) -> tuple[str, ...]:\n    return tuple(dict.fromkeys([assignment.class_id, *assignment.additional_class_ids]))\n\n\ndef lesson_class_ids(lesson: ScheduledLesson) -> tuple[str, ...]:\n    return tuple(dict.fromkeys([lesson.class_id, *lesson.additional_class_ids]))\n\n\ndef _parallel_key(assignment: Assignment) -> str:\n    if assignment.parallel_key:\n        return assignment.parallel_key\n\n    normalized_id = assignment.id.lower()\n    if "-rot-" in normalized_id or "-rotation-" in normalized_id:\n        return f"rotation-id:{re.sub(r'-(g1|g2)$', '', normalized_id)}"\n\n    return f"subject:{assignment.subject_id}"\n\n\ndef parallel_assignment_groups(assignments: list[Assignment]) -> list[list[Assignment]]:\n    grouped: dict[\n        tuple[tuple[str, ...], str],\n        dict[TeachingGroup, list[Assignment]],\n    ] = defaultdict(lambda: defaultdict(list))\n\n    for assignment in assignments:\n        if assignment.group == TeachingGroup.WHOLE:\n            continue\n        key = (\n            tuple(sorted(assignment_class_ids(assignment))),\n            _parallel_key(assignment),\n        )\n        grouped[key][assignment.group].append(assignment)\n\n    result: list[list[Assignment]] = []\n    for groups in grouped.values():\n        present: list[Assignment] = []\n        raw_count = 0\n        for group in PARALLEL_GROUP_ORDER:\n            items = sorted(groups.get(group, []), key=lambda item: item.id)\n            raw_count += len(items)\n            if len(items) == 1:\n                present.append(items[0])\n        if len(present) >= 2 and len(present) == raw_count:\n            result.append(present)\n    return result\n\n\ndef parallel_assignment_pairs(\n    assignments: list[Assignment],\n) -> list[tuple[Assignment, Assignment]]:\n    result: list[tuple[Assignment, Assignment]] = []\n    for group in parallel_assignment_groups(assignments):\n        if (\n            len(group) == 2\n            and group[0].group == TeachingGroup.GROUP_1\n            and group[1].group == TeachingGroup.GROUP_2\n        ):\n            result.append((group[0], group[1]))\n    return result\n\n\ndef rotation_assignment_legs(\n    assignments: list[Assignment],\n) -> list[tuple[str, tuple[Assignment, Assignment], tuple[Assignment, Assignment]]]:\n    by_rotation: dict[str, dict[int, tuple[Assignment, Assignment]]] = defaultdict(dict)\n    for left, right in parallel_assignment_pairs(assignments):\n        if (\n            left.rotation_key\n            and left.rotation_key == right.rotation_key\n            and left.rotation_leg is not None\n            and left.rotation_leg == right.rotation_leg\n        ):\n            by_rotation[left.rotation_key][left.rotation_leg] = (left, right)\n\n    result: list[tuple[str, tuple[Assignment, Assignment], tuple[Assignment, Assignment]]] = []\n    for rotation_key, legs in sorted(by_rotation.items()):\n        if 1 in legs and 2 in legs:\n            result.append((rotation_key, legs[1], legs[2]))\n    return result\n\n\ndef class_required_weekly_periods(assignments: list[Assignment]) -> dict[str, int]:\n    totals: dict[str, int] = defaultdict(int)\n    grouped_ids: set[str] = set()\n\n    for group in parallel_assignment_groups(assignments):\n        grouped_ids.update(item.id for item in group)\n        weekly_periods = max(item.weekly_periods for item in group)\n        for class_id in assignment_class_ids(group[0]):\n            totals[class_id] += weekly_periods\n\n    for assignment in assignments:\n        if assignment.id in grouped_ids:\n            continue\n        for class_id in assignment_class_ids(assignment):\n            totals[class_id] += assignment.weekly_periods\n\n    return dict(totals)\n''',
)
replace(
    "apps/solver/app/main.py",
    '''    class_required_weekly_periods,\n    parallel_assignment_pairs,\n)\n''',
    '''    class_required_weekly_periods,\n    parallel_assignment_groups,\n)\n''',
)
replace(
    "apps/solver/app/main.py",
    '''    class_group_1_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)\n    class_group_2_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)\n    class_all_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)\n''',
    '''    class_group_1_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)\n    class_group_2_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)\n    class_group_3_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)\n    class_all_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)\n''',
)
replace(
    "apps/solver/app/main.py",
    '''                    elif block.assignment.group == TeachingGroup.GROUP_1:\n                        class_group_1_slots[(class_id, candidate.day, period)].append(variable)\n                    else:\n                        class_group_2_slots[(class_id, candidate.day, period)].append(variable)\n''',
    '''                    elif block.assignment.group == TeachingGroup.GROUP_1:\n                        class_group_1_slots[(class_id, candidate.day, period)].append(variable)\n                    elif block.assignment.group == TeachingGroup.GROUP_2:\n                        class_group_2_slots[(class_id, candidate.day, period)].append(variable)\n                    else:\n                        class_group_3_slots[(class_id, candidate.day, period)].append(variable)\n''',
)
replace(
    "apps/solver/app/main.py",
    '''    class_slot_keys = set(class_whole_slots) | set(class_group_1_slots) | set(class_group_2_slots)\n    for key in class_slot_keys:\n        whole = class_whole_slots.get(key, [])\n        group_1 = class_group_1_slots.get(key, [])\n        group_2 = class_group_2_slots.get(key, [])\n        model.add(sum([*whole, *group_1]) <= 1)\n        model.add(sum([*whole, *group_2]) <= 1)\n''',
    '''    class_slot_keys = (\n        set(class_whole_slots)\n        | set(class_group_1_slots)\n        | set(class_group_2_slots)\n        | set(class_group_3_slots)\n    )\n    for key in class_slot_keys:\n        whole = class_whole_slots.get(key, [])\n        for group_slots in (\n            class_group_1_slots.get(key, []),\n            class_group_2_slots.get(key, []),\n            class_group_3_slots.get(key, []),\n        ):\n            model.add(sum([*whole, *group_slots]) <= 1)\n''',
)
replace(
    "apps/solver/app/main.py",
    '''    for left, right in parallel_assignment_pairs(payload.assignments):\n        left_blocks = sorted(\n            blocks_by_assignment[left.id],\n            key=lambda item: item.index,\n        )\n        right_blocks = sorted(\n            blocks_by_assignment[right.id],\n            key=lambda item: item.index,\n        )\n        if [item.duration for item in left_blocks] != [item.duration for item in right_blocks]:\n            raise HTTPException(\n                status_code=422,\n                detail={\n                    "code": "PARALLEL_GROUP_SHAPE_MISMATCH",\n                    "message": ("Dvě poloviny stejné výuky musí mít stejné rozložení hodin."),\n                    "causes": [{"entityIds": [left.id, right.id]}],\n                },\n            )\n        for left_block, right_block in zip(\n            left_blocks,\n            right_blocks,\n            strict=True,\n        ):\n            positions = {(candidate.day, candidate.period) for candidate, _variable in variables[left_block.id]} | {\n                (candidate.day, candidate.period) for candidate, _variable in variables[right_block.id]\n            }\n            for day, period in positions:\n                left_at_position = [\n                    variable for candidate, variable in variables[left_block.id] if candidate.day == day and candidate.period == period\n                ]\n                right_at_position = [\n                    variable for candidate, variable in variables[right_block.id] if candidate.day == day and candidate.period == period\n                ]\n                model.add(sum(left_at_position) == sum(right_at_position))\n''',
    '''    for parallel_group in parallel_assignment_groups(payload.assignments):\n        grouped_blocks = [\n            sorted(blocks_by_assignment[assignment.id], key=lambda item: item.index)\n            for assignment in parallel_group\n        ]\n        expected_shape = [item.duration for item in grouped_blocks[0]]\n        if any(\n            [item.duration for item in blocks] != expected_shape\n            for blocks in grouped_blocks[1:]\n        ):\n            raise HTTPException(\n                status_code=422,\n                detail={\n                    "code": "PARALLEL_GROUP_SHAPE_MISMATCH",\n                    "message": ("Paralelní skupiny stejné výuky musí mít stejné rozložení hodin."),\n                    "causes": [\n                        {"entityIds": [assignment.id for assignment in parallel_group]}\n                    ],\n                },\n            )\n        for block_index in range(len(expected_shape)):\n            blocks_at_index = [blocks[block_index] for blocks in grouped_blocks]\n            positions = {\n                (candidate.day, candidate.period)\n                for block in blocks_at_index\n                for candidate, _variable in variables[block.id]\n            }\n            reference = blocks_at_index[0]\n            for day, period in positions:\n                reference_at_position = [\n                    variable\n                    for candidate, variable in variables[reference.id]\n                    if candidate.day == day and candidate.period == period\n                ]\n                for candidate_block in blocks_at_index[1:]:\n                    candidate_at_position = [\n                        variable\n                        for candidate, variable in variables[candidate_block.id]\n                        if candidate.day == day and candidate.period == period\n                    ]\n                    model.add(\n                        sum(reference_at_position) == sum(candidate_at_position)\n                    )\n''',
)
replace(
    "apps/solver/app/validator.py",
    '''    lesson_class_ids,\n    parallel_assignment_pairs,\n)\n''',
    '''    lesson_class_ids,\n    parallel_assignment_groups,\n)\n''',
)
replace(
    "apps/solver/app/validator.py",
    '''    for left, right in parallel_assignment_pairs(payload.assignments):\n        left_lessons = sorted(lessons_by_assignment[left.id], key=lambda item: item.block_id)\n        right_lessons = sorted(lessons_by_assignment[right.id], key=lambda item: item.block_id)\n        if len(left_lessons) != len(right_lessons):\n            continue\n        for left_lesson, right_lesson in zip(left_lessons, right_lessons, strict=True):\n            if (\n                left_lesson.day != right_lesson.day\n                or left_lesson.period != right_lesson.period\n                or left_lesson.duration != right_lesson.duration\n            ):\n                issues.append(\n                    ValidationIssue(\n                        code="PARALLEL_GROUP_DESYNCHRONIZED",\n                        message="Obě poloviny dělené výuky musí probíhat současně.",\n                        entity_ids=[left_lesson.block_id, right_lesson.block_id],\n                        day=left_lesson.day,\n                        period=left_lesson.period,\n                    )\n                )\n''',
    '''    for parallel_group in parallel_assignment_groups(payload.assignments):\n        grouped_lessons = [\n            sorted(lessons_by_assignment[item.id], key=lambda lesson: lesson.block_id)\n            for item in parallel_group\n        ]\n        expected_length = len(grouped_lessons[0])\n        if any(len(items) != expected_length for items in grouped_lessons[1:]):\n            continue\n        for index in range(expected_length):\n            reference = grouped_lessons[0][index]\n            for candidate_group in grouped_lessons[1:]:\n                candidate = candidate_group[index]\n                if (\n                    reference.day != candidate.day\n                    or reference.period != candidate.period\n                    or reference.duration != candidate.duration\n                ):\n                    issues.append(\n                        ValidationIssue(\n                            code="PARALLEL_GROUP_DESYNCHRONIZED",\n                            message="Všechny paralelní skupiny dělené výuky musí probíhat současně.",\n                            entity_ids=[reference.block_id, candidate.block_id],\n                            day=reference.day,\n                            period=reference.period,\n                        )\n                    )\n''',
)

# 8) Editor exposes the third AJ teacher and keeps workload accounting correct.
replace(
    "apps/web/app/teaching-plan/page.tsx",
    '''    plan.rows.flatMap((row) => [row.primaryTeacherId, row.secondaryTeacherId]),\n''',
    '''    plan.rows.flatMap((row) => [\n      row.primaryTeacherId,\n      row.secondaryTeacherId,\n      row.tertiaryTeacherId ?? "",\n    ]),\n''',
)
replace(
    "apps/web/app/teaching-plan/page.tsx",
    '''                      secondaryTeacherId:\n                        organization.value === "WHOLE"\n                          ? ""\n                          : current.secondaryTeacherId,\n''',
    '''                      secondaryTeacherId:\n                        organization.value === "WHOLE"\n                          ? ""\n                          : current.secondaryTeacherId,\n                      tertiaryTeacherId:\n                        organization.value === "SPLIT"\n                          ? current.tertiaryTeacherId\n                          : "",\n                      splitGroupCount:\n                        organization.value === "SPLIT"\n                          ? (current.splitGroupCount ?? 2)\n                          : 2,\n''',
)
replace(
    "apps/web/app/teaching-plan/page.tsx",
    '''          {row.organization === "SPLIT" ? (\n            <div className="mt-3 rounded-xl border border-success-border bg-success-subtle p-4 text-sm text-success-strong">\n''',
    '''          {row.organization === "SPLIT" && row.subjectCode === "JAZ1" && !sameTeacherPartial ? (\n            <div className="mt-4 max-w-sm">\n              <label className="text-sm font-medium text-text-primary">\n                Počet souběžných skupin angličtiny\n                <select\n                  value={row.splitGroupCount === 3 ? "3" : "2"}\n                  onChange={(event) =>\n                    update((current) => ({\n                      ...current,\n                      splitGroupCount: event.target.value === "3" ? 3 : 2,\n                      tertiaryTeacherId:\n                        event.target.value === "3"\n                          ? current.tertiaryTeacherId\n                          : "",\n                    }))\n                  }\n                  className={`${inputClass} mt-1.5`}\n                  aria-label={`Počet skupin ${index + 1}`}\n                >\n                  <option value="2">2 skupiny</option>\n                  <option value="3">3 skupiny</option>\n                </select>\n              </label>\n            </div>\n          ) : null}\n\n          {row.organization === "SPLIT" ? (\n            <div className="mt-3 rounded-xl border border-success-border bg-success-subtle p-4 text-sm text-success-strong">\n''',
)
replace(
    "apps/web/app/teaching-plan/page.tsx",
    '''              row.organization === "WHOLE" || sameTeacherPartial\n                ? "mt-3 max-w-xl"\n                : "mt-3 grid gap-4 md:grid-cols-2"\n''',
    '''              row.organization === "WHOLE" || sameTeacherPartial\n                ? "mt-3 max-w-xl"\n                : row.organization === "SPLIT" && row.splitGroupCount === 3\n                  ? "mt-3 grid gap-4 md:grid-cols-3"\n                  : "mt-3 grid gap-4 md:grid-cols-2"\n''',
)
replace(
    "apps/web/app/teaching-plan/page.tsx",
    '''            {row.organization !== "WHOLE" && !sameTeacherPartial ? (\n              <TeacherSelect\n''',
    '''            {row.organization !== "WHOLE" && !sameTeacherPartial ? (\n              <TeacherSelect\n''',
)
replace(
    "apps/web/app/teaching-plan/page.tsx",
    '''            ) : null}\n          </div>\n        </div>\n\n        {!validation.valid ? (\n''',
    '''            ) : null}\n            {\n              row.organization === "SPLIT" &&\n              row.splitGroupCount === 3 &&\n              !sameTeacherPartial ? (\n                <TeacherSelect\n                  label="Skupina 3"\n                  value={row.tertiaryTeacherId ?? ""}\n                  teachers={sortedTeachers(row.subjectCode)}\n                  subjectCode={row.subjectCode}\n                  onChange={(value) =>\n                    update((current) => ({\n                      ...current,\n                      tertiaryTeacherId: value,\n                    }))\n                  }\n                  ariaLabel={`Učitel 3 předmětu ${index + 1}`}\n                />\n              ) : null\n            }\n          </div>\n        </div>\n\n        {!validation.valid ? (\n''',
)
replace(
    "apps/web/app/teaching-plan/page.tsx",
    '''                : `${humanBlockSummary(row)} · ${sameTeacherPartial ? "1 hodina půlená, stejný učitel pro obě skupiny" : row.organization === "SPLIT" ? "dvě souběžné skupiny" : "celá třída"}`}\n''',
    '''                : `${humanBlockSummary(row)} · ${sameTeacherPartial ? "1 hodina půlená, stejný učitel pro obě skupiny" : row.organization === "SPLIT" ? row.splitGroupCount === 3 ? "tři souběžné skupiny" : "dvě souběžné skupiny" : "celá třída"}`}\n''',
)

# 9) Regression tests: storage reset key ownership, solo 8.B INF, 3-group AJ, TV cap, solver GROUP_3.
replace(
    "apps/web/tests/project-share.test.ts",
    '''  createBrowserProjectShareEnvelope,\n  decodeBrowserProjectShare,\n''',
    '''  BROWSER_PROJECT_LOCAL_STORAGE_KEYS,\n  BROWSER_PROJECT_SESSION_STORAGE_KEYS,\n  createBrowserProjectShareEnvelope,\n  decodeBrowserProjectShare,\n''',
)
with Path("apps/web/tests/project-share.test.ts").open("a") as handle:
    handle.write('''\n\ntest("browser project owns every persisted working-data key needed for full deletion", () => {\n  assert.deepEqual(\n    new Set(BROWSER_PROJECT_LOCAL_STORAGE_KEYS),\n    new Set([\n      "rozvrhar:staffing-plan:v1",\n      "rozvrhar:teaching-plan:v1",\n      "rozvrhar:staffing-allocation-draft:v1",\n      "rozvrhar:school-curriculum:v1",\n      "rozvrhar:teaching-plan-workload-credits:v1",\n      "rozvrhar:teaching-plan-allocation-draft-applied:v1",\n      "rozvrhar:teaching-plan-shared:v1",\n      "rozvrhar:teaching-plan-split-periods:v1",\n    ]),\n  );\n  assert.deepEqual(BROWSER_PROJECT_SESSION_STORAGE_KEYS, [\n    "rozvrhar:teaching-plan-import-review:v1",\n  ]);\n});\n''')

replace(
    "apps/web/e2e/local-first.spec.ts",
    '''  page.on("dialog", (dialog) => void dialog.accept());\n  await page.getByRole("button", { name: "Vymazat lokální projekt" }).click();\n''',
    '''  await page.evaluate(() => {\n    for (const key of [\n      "rozvrhar:staffing-plan:v1",\n      "rozvrhar:teaching-plan:v1",\n      "rozvrhar:staffing-allocation-draft:v1",\n      "rozvrhar:school-curriculum:v1",\n      "rozvrhar:teaching-plan-workload-credits:v1",\n      "rozvrhar:teaching-plan-allocation-draft-applied:v1",\n      "rozvrhar:teaching-plan-shared:v1",\n      "rozvrhar:teaching-plan-split-periods:v1",\n    ]) {\n      window.localStorage.setItem(key, "delete-me");\n    }\n    window.sessionStorage.setItem(\n      "rozvrhar:teaching-plan-import-review:v1",\n      "delete-me",\n    );\n  });\n  page.on("dialog", (dialog) => void dialog.accept());\n  await page.getByRole("button", { name: "Vymazat lokální projekt" }).click();\n''',
)
replace(
    "apps/web/e2e/local-first.spec.ts",
    '''  await expect(\n    page.getByText("Lokální projekt byl vymazán a vytvořen znovu prázdný."),\n  ).toBeVisible();\n\n  await page.getByRole("link", { name: "Přehled" }).click();\n''',
    '''  await expect(\n    page.getByText("Lokální projekt byl vymazán a vytvořen znovu prázdný."),\n  ).toBeVisible();\n  const remainingOwnedKeys = await page.evaluate(() => ({\n    local: [\n      "rozvrhar:staffing-plan:v1",\n      "rozvrhar:teaching-plan:v1",\n      "rozvrhar:staffing-allocation-draft:v1",\n      "rozvrhar:school-curriculum:v1",\n      "rozvrhar:teaching-plan-workload-credits:v1",\n      "rozvrhar:teaching-plan-allocation-draft-applied:v1",\n      "rozvrhar:teaching-plan-shared:v1",\n      "rozvrhar:teaching-plan-split-periods:v1",\n    ].filter((key) => window.localStorage.getItem(key) !== null),\n    session:\n      window.sessionStorage.getItem(\n        "rozvrhar:teaching-plan-import-review:v1",\n      ) !== null,\n  }));\n  expect(remainingOwnedKeys).toEqual({ local: [], session: false });\n\n  await page.getByRole("link", { name: "Přehled" }).click();\n''',
)

replace(
    "apps/web/tests/compact-staffing-matrix.test.ts",
    '  sheet.getCell("C8").value = "Syrůčková/Rus";\n',
    '  sheet.getCell("C8").value = "Syrůčková/Rus/Testová";\n',
)
replace(
    "apps/web/tests/compact-staffing-matrix.test.ts",
    '  sheet.getCell("C9").value = "Mašek/Šárová";\n',
    '  sheet.getCell("C9").value = "Mašek/Šárová/Náhradní";\n',
)
replace(
    "apps/web/tests/compact-staffing-matrix.test.ts",
    '''  assert.equal(hours(analysis, "Rus", "JAZ1"), 4);\n  assert.equal(hours(analysis, "Mašek", "TV"), 2);\n''',
    '''  assert.equal(hours(analysis, "Rus", "JAZ1"), 4);\n  assert.equal(hours(analysis, "Testová", "JAZ1"), 4);\n  assert.equal(hours(analysis, "Mašek", "TV"), 2);\n''',
)
replace(
    "apps/web/tests/compact-staffing-matrix.test.ts",
    '''  const czech = analysis.allocationDraft?.rows.find(\n    (row) => row.classCode === "6.A" && row.subjectCode === "CJ",\n  );\n  assert.equal(czech?.weeklyPeriods, 5);\n  assert.equal(czech?.teacherIds.length, 1);\n});\n''',
    '''  const czech = analysis.allocationDraft?.rows.find(\n    (row) => row.classCode === "6.A" && row.subjectCode === "CJ",\n  );\n  assert.equal(czech?.weeklyPeriods, 5);\n  assert.equal(czech?.teacherIds.length, 1);\n  const english = analysis.allocationDraft?.rows.find(\n    (row) => row.classCode === "6.A" && row.subjectCode === "JAZ1",\n  );\n  assert.equal(english?.teacherIds.length, 3);\n  const pe = analysis.allocationDraft?.rows.find(\n    (row) => row.classCode === "6.A" && row.subjectCode === "TV",\n  );\n  assert.equal(pe?.teacherIds.length, 2);\n  assert.ok(\n    analysis.issues.some((item) =>\n      item.message.includes("TV zůstává rozdělená jen na dvě žákovské skupiny"),\n    ),\n  );\n});\n''',
)

# Update the anonymized full-school fixture to reflect the confirmed solo 8.B INF rule.
replace(
    "apps/web/test-support/exact-uploaded-excel-fixture.ts",
    '["Inf", "T09/T10", 1],\n    ["F", "T26", 2],\n    ["Tv", "T18/T23", 5],',
    '["Inf", "T09", 1],\n    ["F", "T26", 2],\n    ["Tv", "T18/T23", 5],',
)

# Add focused TypeScript regression coverage for solo INF and three-group English generation.
write(
    "apps/web/tests/three-group-school-rules.test.ts",
    '''import assert from "node:assert/strict";\nimport test from "node:test";\n\nimport type { LocalProject } from "../lib/local/api";\nimport { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";\nimport { createEmptyStaffingPlan } from "../lib/local/staffing-plan-school-v2";\nimport {\n  SCHOOL_CLASS_CODES,\n  createTeachingPlanClass,\n  createTeachingPlanRow,\n} from "../lib/local/teaching-plan-school";\nimport {\n  applySchoolOperationalRules,\n  createEmptyTeachingPlan,\n} from "../lib/local/teaching-plan-school-v3";\n\nfunction emptyProject(): LocalProject {\n  return {\n    schemaVersion: 1,\n    id: "local-school-year",\n    schoolName: "Test",\n    label: "2026/2027",\n    status: "ACTIVE",\n    periodsPerDay: [8, 8, 8, 8, 7],\n    version: 1,\n    updatedAt: "test",\n    teachers: [],\n    classes: [],\n    subjects: [],\n    roomTypes: [],\n    rooms: [],\n    assignments: [],\n    availability: [],\n    fixedLessons: [],\n    importBatches: [],\n    generationRuns: [],\n    timetableVersions: [],\n  };\n}\n\ntest("8.B informatics stays solo and does not require a second teacher", () => {\n  const staffing = createEmptyStaffingPlan();\n  staffing.teachers = [\n    {\n      id: "inf-one",\n      firstName: "A",\n      lastName: "Teacher",\n      targetWeeklyLoad: 1,\n      subjectLoads: [{ id: "inf", subjectCode: "INF", weeklyPeriods: 1 }],\n      unavailableDays: [],\n    },\n  ];\n  const plan = createEmptyTeachingPlan();\n  plan.classes = SCHOOL_CLASS_CODES.map((code) => createTeachingPlanClass(code));\n  const row = createTeachingPlanRow("8.B", "INF");\n  row.weeklyPeriods = 1;\n  row.organization = "SPLIT";\n  row.primaryTeacherId = "inf-one";\n  row.secondaryTeacherId = "";\n  plan.rows = [row];\n\n  const enforced = applySchoolOperationalRules(plan, staffing, null);\n  assert.equal(enforced.rows[0]?.organization, "WHOLE");\n  assert.equal(enforced.rows[0]?.primaryTeacherId, "inf-one");\n  assert.equal(enforced.rows[0]?.secondaryTeacherId, "");\n});\n\ntest("three-group English generates three synchronized solver assignments", () => {\n  const staffing = createEmptyStaffingPlan();\n  staffing.teachers = ["one", "two", "three"].map((id) => ({\n    id,\n    firstName: id,\n    lastName: "Teacher",\n    targetWeeklyLoad: 3,\n    subjectLoads: [{ id: `${id}-aj`, subjectCode: "JAZ1", weeklyPeriods: 3 }],\n    unavailableDays: [],\n  }));\n  const plan = createEmptyTeachingPlan();\n  plan.classes = [createTeachingPlanClass("6.A")];\n  const row = createTeachingPlanRow("6.A", "JAZ1");\n  row.weeklyPeriods = 3;\n  row.organization = "SPLIT";\n  row.primaryTeacherId = "one";\n  row.secondaryTeacherId = "two";\n  row.tertiaryTeacherId = "three";\n  row.splitGroupCount = 3;\n  plan.rows = [row];\n\n  const generated = buildSchoolProjectForGeneration({\n    existingProject: emptyProject(),\n    staffingPlan: staffing,\n    teachingPlan: plan,\n    forceReplaceGeneratedData: false,\n  });\n  assert.deepEqual(generated.blockers, []);\n  assert.deepEqual(\n    generated.project.assignments.map((item) => item.group).sort(),\n    ["GROUP_1", "GROUP_2", "GROUP_3"],\n  );\n  assert.equal(\n    new Set(generated.project.assignments.map((item) => item.parallelKey)).size,\n    1,\n  );\n});\n''',
)

with Path("apps/solver/tests/test_solve.py").open("a") as handle:
    handle.write('''\n\ndef test_three_split_groups_run_in_the_same_parallel_slot() -> None:\n    response = client.post(\n        "/solve",\n        json={\n            "periods_per_day": [2],\n            "assignments": [\n                {\n                    "id": "english-6a-g1",\n                    "teacher_id": "teacher-1",\n                    "class_id": "6a",\n                    "subject_id": "english",\n                    "group": "GROUP_1",\n                    "weekly_periods": 1,\n                    "parallel_key": "english-6a",\n                },\n                {\n                    "id": "english-6a-g2",\n                    "teacher_id": "teacher-2",\n                    "class_id": "6a",\n                    "subject_id": "english",\n                    "group": "GROUP_2",\n                    "weekly_periods": 1,\n                    "parallel_key": "english-6a",\n                },\n                {\n                    "id": "english-6a-g3",\n                    "teacher_id": "teacher-3",\n                    "class_id": "6a",\n                    "subject_id": "english",\n                    "group": "GROUP_3",\n                    "weekly_periods": 1,\n                    "parallel_key": "english-6a",\n                },\n            ],\n        },\n    )\n\n    assert response.status_code == 200, response.text\n    lessons = response.json()["lessons"]\n    assert {lesson["group"] for lesson in lessons} == {\n        "GROUP_1",\n        "GROUP_2",\n        "GROUP_3",\n    }\n    assert len({(lesson["day"], lesson["period"]) for lesson in lessons}) == 1\n''')

# Preserve the new product invariant for future agents.
replace(
    "AGENTS.md",
    "- Dělená výuka má v MVP právě dvě skupiny.\n",
    "- Dělená výuka má standardně dvě skupiny; angličtina může mít explicitně tři paralelní skupiny. TV zůstává vždy přesně ve dvou žákovských skupinách.\n",
)

print("school group + deletion patch applied")
