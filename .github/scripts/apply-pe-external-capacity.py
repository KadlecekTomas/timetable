from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Missing patch anchor in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "apps/web/lib/local/api-school.ts",
    'import { buildSchoolProjectForGeneration } from "./school-project-generation";\n',
    'import { loadPhysicalEducationExternalOccupancy } from "./physical-education-external-occupancy";\n'
    'import { buildSchoolProjectForGeneration } from "./school-project-generation";\n',
)
replace_once(
    "apps/web/lib/local/api-school.ts",
    "      teachingPlan: loadTeachingPlan(),\n      forceReplaceGeneratedData: body.forceReplaceGeneratedData === true,\n",
    "      teachingPlan: loadTeachingPlan(),\n"
    "      physicalEducationExternalOccupancy:\n"
    "        loadPhysicalEducationExternalOccupancy().slots,\n"
    "      forceReplaceGeneratedData: body.forceReplaceGeneratedData === true,\n",
)

replace_once(
    "apps/web/lib/local/school-project-generation.ts",
    'import { schoolInputFingerprint } from "./school-input-state";\n',
    'import {\n'
    '  normalizePhysicalEducationExternalOccupancySlots,\n'
    '  type PhysicalEducationExternalOccupancySlot,\n'
    '} from "./physical-education-external-occupancy";\n'
    'import { schoolInputFingerprint } from "./school-input-state";\n',
)
replace_once(
    "apps/web/lib/local/school-project-generation.ts",
    "const THURSDAY_DAY_INDEX = 3;\n\nexport interface SchoolProjectGenerationSummary",
    "const THURSDAY_DAY_INDEX = 3;\n\n"
    "function physicalEducationRoomAvailableOnDay(\n"
    "  roomId: string,\n"
    "  dayIndex: number,\n"
    "): boolean {\n"
    "  if (dayIndex === MONDAY_DAY_INDEX) return false;\n"
    "  return (\n"
    "    !THURSDAY_ONLY_PHYSICAL_EDUCATION_ROOM_IDS.has(roomId) ||\n"
    "    dayIndex === THURSDAY_DAY_INDEX\n"
    "  );\n"
    "}\n\n"
    "function externalPhysicalEducationAvailability(\n"
    "  slots: PhysicalEducationExternalOccupancySlot[],\n"
    "  periodsPerDay: number[],\n"
    "): LocalAvailability[] {\n"
    "  return normalizePhysicalEducationExternalOccupancySlots(slots).flatMap(\n"
    "    (slot) => {\n"
    "      if (slot.period >= (periodsPerDay[slot.dayOfWeek] ?? 0)) return [];\n"
    "      const availableRooms = PHYSICAL_EDUCATION_ROOMS.filter((room) =>\n"
    "        physicalEducationRoomAvailableOnDay(room.id, slot.dayOfWeek),\n"
    "      );\n"
    "      const occupiedCount = Math.min(\n"
    "        slot.occupiedSpaces,\n"
    "        availableRooms.length,\n"
    "      );\n"
    "      const blockedRooms = availableRooms.slice(\n"
    "        Math.max(0, availableRooms.length - occupiedCount),\n"
    "      );\n"
    "      return blockedRooms.map((room) => ({\n"
    "        id: `availability:pe-external:${slot.dayOfWeek}:${slot.period}:${room.id}`,\n"
    "        entityType: \"ROOM\" as const,\n"
    "        entityId: room.id,\n"
    "        dayOfWeek: slot.dayOfWeek,\n"
    "        period: slot.period,\n"
    "        kind: \"UNAVAILABLE\" as const,\n"
    "        weight: null,\n"
    "        reason: `TV prostor je v tomto čase využit 1. stupněm; externě rezervováno ${slot.occupiedSpaces} z ${availableRooms.length} dostupných kapacit.`,\n"
    "      }));\n"
    "    },\n"
    "  );\n"
    "}\n\n"
    "export interface SchoolProjectGenerationSummary",
)
replace_once(
    "apps/web/lib/local/school-project-generation.ts",
    "  teachingPlan,\n  forceReplaceGeneratedData,\n}: {\n  existingProject: LocalProject;\n  staffingPlan: StaffingPlan;\n  teachingPlan: TeachingPlan;\n  forceReplaceGeneratedData: boolean;\n",
    "  teachingPlan,\n"
    "  physicalEducationExternalOccupancy = [],\n"
    "  forceReplaceGeneratedData,\n"
    "}: {\n"
    "  existingProject: LocalProject;\n"
    "  staffingPlan: StaffingPlan;\n"
    "  teachingPlan: TeachingPlan;\n"
    "  physicalEducationExternalOccupancy?: PhysicalEducationExternalOccupancySlot[];\n"
    "  forceReplaceGeneratedData: boolean;\n",
)
replace_once(
    "apps/web/lib/local/school-project-generation.ts",
    "  const availability = [\n    ...teacherAvailability,\n    ...physicalEducationAvailability,\n  ];\n",
    "  const physicalEducationExternalAvailability = usesPhysicalEducation\n"
    "    ? externalPhysicalEducationAvailability(\n"
    "        physicalEducationExternalOccupancy,\n"
    "        existingProject.periodsPerDay,\n"
    "      )\n"
    "    : [];\n"
    "  const availability = [\n"
    "    ...teacherAvailability,\n"
    "    ...physicalEducationAvailability,\n"
    "    ...physicalEducationExternalAvailability,\n"
    "  ];\n",
)

replace_once(
    "apps/web/lib/local/project-share.ts",
    'import {\n  getLocalProject,\n',
    'import { PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_STORAGE_KEY } from "@/lib/local/physical-education-external-occupancy";\n'
    'import {\n  getLocalProject,\n',
)
replace_once(
    "apps/web/lib/local/project-share.ts",
    '  "rozvrhar:teaching-plan-split-periods:v1",\n] as const;\n',
    '  "rozvrhar:teaching-plan-split-periods:v1",\n'
    '  PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_STORAGE_KEY,\n'
    '] as const;\n',
)

# Add the PE-capacity editor to the existing optional data page.
data_path = Path("apps/web/app/data/page.tsx")
data = data_path.read_text()
anchor = 'import {\n  preparedInputState,\n  type PreparedInputState,\n} from "@/lib/local/school-input-state";\n'
insert = (
    'import {\n'
    '  PHYSICAL_EDUCATION_BASE_CAPACITY_BY_DAY,\n'
    '  loadPhysicalEducationExternalOccupancy,\n'
    '  occupiedPhysicalEducationSpacesAt,\n'
    '  savePhysicalEducationExternalOccupancy,\n'
    '  subscribePhysicalEducationExternalOccupancy,\n'
    '  type PhysicalEducationExternalOccupancySlot,\n'
    '} from "@/lib/local/physical-education-external-occupancy";\n'
    + anchor
)
if anchor not in data:
    raise SystemExit("Missing data-page import anchor")
data = data.replace(anchor, insert, 1)
data = data.replace(
    '  { id: "rooms", label: "Učebny" },\n] as const;',
    '  { id: "rooms", label: "Učebny" },\n'
    '  { id: "pe-occupancy", label: "Obsazenost TV 1. stupně" },\n'
    '] as const;',
    1,
)
data = data.replace(
    'const inputClass =\n  "mt-1.5 h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";\n',
    'const inputClass =\n'
    '  "mt-1.5 h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";\n'
    'const peDayNames = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"];\n',
    1,
)
data = data.replace(
    '  const [projectVersion, setProjectVersion] = useState<number | null>(null);\n',
    '  const [projectVersion, setProjectVersion] = useState<number | null>(null);\n'
    '  const [periodsPerDay, setPeriodsPerDay] = useState<number[]>([8, 8, 8, 8, 7]);\n'
    '  const [peOccupancy, setPeOccupancy] = useState<\n'
    '    PhysicalEducationExternalOccupancySlot[]\n'
    '  >([]);\n',
    1,
)
data = data.replace(
    '    setPrepared(state);\n    setProjectVersion(project.version);\n',
    '    setPrepared(state);\n'
    '    setProjectVersion(project.version);\n'
    '    setPeriodsPerDay(project.periodsPerDay);\n'
    '    setPeOccupancy(loadPhysicalEducationExternalOccupancy().slots);\n',
    1,
)
data = data.replace(
    '    if (state === "EMPTY") {\n      setRecords([]);\n      setRoomTypes([]);\n      return;\n    }\n',
    '    if (state === "EMPTY" || section === "pe-occupancy") {\n'
    '      setRecords([]);\n'
    '      setRoomTypes([]);\n'
    '      return;\n'
    '    }\n',
    1,
)
data = data.replace(
    '    const unsubTeaching = subscribeTeachingPlan(refresh);\n    window.addEventListener("focus", refresh);\n',
    '    const unsubTeaching = subscribeTeachingPlan(refresh);\n'
    '    const unsubPeOccupancy = subscribePhysicalEducationExternalOccupancy(refresh);\n'
    '    window.addEventListener("focus", refresh);\n',
    1,
)
data = data.replace(
    '      unsubTeaching();\n      window.removeEventListener("focus", refresh);\n',
    '      unsubTeaching();\n'
    '      unsubPeOccupancy();\n'
    '      window.removeEventListener("focus", refresh);\n',
    1,
)
data = data.replace(
    '  async function submit(event: FormEvent<HTMLFormElement>) {\n    event.preventDefault();\n    if (projectVersion == null) return;\n',
    '  function updatePeOccupancy(\n'
    '    dayOfWeek: number,\n'
    '    period: number,\n'
    '    occupiedSpaces: number,\n'
    '  ) {\n'
    '    const next = peOccupancy.filter(\n'
    '      (slot) => !(slot.dayOfWeek === dayOfWeek && slot.period === period),\n'
    '    );\n'
    '    if (occupiedSpaces > 0) {\n'
    '      next.push({ dayOfWeek, period, occupiedSpaces });\n'
    '    }\n'
    '    const saved = savePhysicalEducationExternalOccupancy(next);\n'
    '    setPeOccupancy(saved.slots);\n'
    '    setError(null);\n'
    '    setMessage(\n'
    '      "Obsazenost TV prostorů byla uložena. Projeví se při další přípravě dat pro generátor.",\n'
    '    );\n'
    '  }\n\n'
    '  async function submit(event: FormEvent<HTMLFormElement>) {\n'
    '    event.preventDefault();\n'
    '    if (projectVersion == null || section === "pe-occupancy") return;\n',
    1,
)

start_marker = '      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">'
start = data.find(start_marker)
if start < 0:
    raise SystemExit("Missing data-page generic section start")
end_marker = '      </section>\n    </div>\n  );'
end = data.find(end_marker, start)
if end < 0:
    raise SystemExit("Missing data-page generic section end")
end += len('      </section>')
generic = data[start:end]
custom = '''      {section === "pe-occupancy" ? (\n        <section className="rounded-xl border border-border bg-surface p-5">\n          <div>\n            <h2 className="font-semibold text-text-primary">\n              Obsazenost sportovních prostor 1. stupně\n            </h2>\n            <p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">\n              Neřešte konkrétní halu. Zadejte pouze počet sportovních prostorů,\n              které v dané hodině zabere 1. stupeň. Solver o stejný počet sníží\n              dostupnou kapacitu pro TV na 2. stupni.\n            </p>\n          </div>\n          <div className="mt-5 grid gap-4 xl:grid-cols-2">\n            {peDayNames.map((day, dayIndex) => {\n              const baseCapacity =\n                PHYSICAL_EDUCATION_BASE_CAPACITY_BY_DAY[dayIndex] ?? 0;\n              return (\n                <article\n                  key={day}\n                  className="rounded-lg border border-border bg-surface-muted p-4"\n                >\n                  <div className="flex items-center justify-between gap-3">\n                    <h3 className="font-medium text-text-primary">{day}</h3>\n                    <span className="text-xs text-text-muted">\n                      Základní TV kapacita: {baseCapacity}\n                    </span>\n                  </div>\n                  {baseCapacity === 0 ? (\n                    <p className="mt-3 text-sm text-text-muted">\n                      TV je v tento den už globálně zakázána, další blokace není\n                      potřeba.\n                    </p>\n                  ) : (\n                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">\n                      {Array.from(\n                        { length: periodsPerDay[dayIndex] ?? 0 },\n                        (_unused, period) => {\n                          const occupied = occupiedPhysicalEducationSpacesAt(\n                            peOccupancy,\n                            dayIndex,\n                            period,\n                          );\n                          return (\n                            <label\n                              key={`${dayIndex}-${period}`}\n                              className="rounded-md border border-border bg-surface p-2 text-xs font-medium text-text-muted"\n                            >\n                              {period + 1}. hodina\n                              <select\n                                className="mt-1 h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text-primary"\n                                value={occupied}\n                                onChange={(event) =>\n                                  updatePeOccupancy(\n                                    dayIndex,\n                                    period,\n                                    Number(event.target.value),\n                                  )\n                                }\n                              >\n                                {Array.from(\n                                  { length: baseCapacity + 1 },\n                                  (_option, value) => (\n                                    <option key={value} value={value}>\n                                      {value} zabraných · {baseCapacity - value}{" "}\n                                      volných\n                                    </option>\n                                  ),\n                                )}\n                              </select>\n                            </label>\n                          );\n                        },\n                      )}\n                    </div>\n                  )}\n                </article>\n              );\n            })}\n          </div>\n        </section>\n      ) : (\n'''
data = data[:start] + custom + generic + '\n      )}' + data[end:]
data_path.write_text(data)

# Web regression: generated project must reserve two generic PE capacity slots.
test_path = Path("apps/web/tests/school-pe-facilities.test.ts")
test_text = test_path.read_text()
test_text += '''\n\ntest("first-grade occupancy reserves two generic PE spaces in a slot", () => {\n  const staffingPlan: StaffingPlan = {\n    version: 1,\n    updatedAt: "test",\n    teachers: [\n      {\n        id: "tv",\n        firstName: "Tělocvik",\n        lastName: "Testovací",\n        targetWeeklyLoad: 2,\n        subjectLoads: [\n          { id: "tv-load", subjectCode: "TV", weeklyPeriods: 2 },\n        ],\n        unavailableDays: [],\n      },\n    ],\n  };\n  const teachingPlan: TeachingPlan = {\n    version: 1,\n    updatedAt: "test",\n    classes: [\n      { id: "class-plan", code: "7.A", grade: 7, profile: "REGULAR" },\n    ],\n    rows: [\n      {\n        id: "row-tv",\n        classCode: "7.A",\n        subjectCode: "TV",\n        weeklyPeriods: 2,\n        lessonShape: "DOUBLE",\n        doublePeriodsCount: 1,\n        organization: "WHOLE",\n        primaryTeacherId: "tv",\n        secondaryTeacherId: "",\n      },\n    ],\n  };\n\n  const result = buildSchoolProjectForGeneration({\n    existingProject: emptyProject(),\n    staffingPlan,\n    teachingPlan,\n    physicalEducationExternalOccupancy: [\n      { dayOfWeek: 3, period: 2, occupiedSpaces: 2 },\n    ],\n    forceReplaceGeneratedData: false,\n  });\n\n  assert.deepEqual(result.blockers, []);\n  const externalRules = result.project.availability.filter(\n    (rule) =>\n      rule.entityType === "ROOM" &&\n      rule.dayOfWeek === 3 &&\n      rule.period === 2 &&\n      rule.reason?.includes("1. stupněm"),\n  );\n  assert.equal(externalRules.length, 2);\n  assert.equal(new Set(externalRules.map((rule) => rule.entityId)).size, 2);\n});\n'''
test_path.write_text(test_text)

solver_test = Path("apps/solver/tests/test_school_pe_facilities.py")
solver_text = solver_test.read_text()
solver_text += '''\n\ndef test_two_external_occupied_spaces_reduce_thursday_capacity() -> None:\n    periods_per_day = [1, 1, 1, 1, 1]\n    availability = room_unavailability(periods_per_day)\n    for room_id in ["room:HALA1", "room:HALA2"]:\n        availability.append(\n            {\n                "entity_type": "ROOM",\n                "entity_id": room_id,\n                "day": 3,\n                "period": 0,\n                "kind": "UNAVAILABLE",\n            }\n        )\n\n    assignments: list[dict[str, object]] = []\n    for index in range(4):\n        teacher_id = f"teacher-external-{index}"\n        assignments.append(\n            {\n                "id": f"tv-external-{index}",\n                "teacher_id": teacher_id,\n                "class_id": f"class-external-{index}",\n                "subject_id": "subject:TV",\n                "weekly_periods": 1,\n                "required_room_type_id": "room-type:TV",\n            }\n        )\n        for day in [1, 2, 4]:\n            availability.append(\n                {\n                    "entity_type": "TEACHER",\n                    "entity_id": teacher_id,\n                    "day": day,\n                    "period": 0,\n                    "kind": "UNAVAILABLE",\n                }\n            )\n\n    response = client.post(\n        "/solve",\n        json={\n            "periods_per_day": periods_per_day,\n            "subjects": [{"id": "subject:TV", "code": "TV"}],\n            "rooms": sport_rooms(),\n            "availability": availability,\n            "assignments": assignments,\n        },\n    )\n\n    assert response.status_code == 422, response.text\n'''
solver_test.write_text(solver_text)
