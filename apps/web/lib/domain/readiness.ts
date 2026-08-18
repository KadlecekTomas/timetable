import type {
  CanonicalSnapshot,
  ReadinessIssue,
  ReadinessReport,
  SnapshotAssignment,
} from "./contracts";

function issue(
  code: string,
  severity: ReadinessIssue["severity"],
  message: string,
  entityIds: string[] = [],
  suggestion?: string,
): ReadinessIssue {
  return { code, severity, message, entity_ids: entityIds, suggestion };
}

function assignmentIdentity(assignment: SnapshotAssignment): string {
  return assignment.code ?? assignment.id;
}

export function evaluateReadiness(
  snapshot: CanonicalSnapshot,
): ReadinessReport {
  const blockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const add = (item: ReadinessIssue) =>
    item.severity === "ERROR" ? blockers.push(item) : warnings.push(item);

  if (snapshot.teachers.length === 0) {
    add(
      issue(
        "TEACHERS_MISSING",
        "ERROR",
        "Školní rok nemá žádné aktivní učitele.",
      ),
    );
  }
  if (snapshot.classes.length === 0) {
    add(
      issue("CLASSES_MISSING", "ERROR", "Školní rok nemá žádné aktivní třídy."),
    );
  }
  if (snapshot.subjects.length === 0) {
    add(issue("SUBJECTS_MISSING", "ERROR", "Školní rok nemá žádné předměty."));
  }
  if (snapshot.assignments.length === 0) {
    add(
      issue(
        "ASSIGNMENTS_MISSING",
        "ERROR",
        "Nejsou zadané žádné výukové vazby.",
        [],
        "Doplňte, kdo učí který předmět v jednotlivých třídách.",
      ),
    );
  }

  snapshot.periods_per_day.forEach((periods, day) => {
    if (!Number.isInteger(periods) || periods < 1 || periods > 16) {
      add(
        issue(
          "INVALID_PERIOD_COUNT",
          "ERROR",
          `Den ${day + 1} má neplatný počet vyučovacích hodin.`,
          [String(day)],
          "Zadejte celé číslo od 1 do 16.",
        ),
      );
    }
  });

  const teachers = new Map(
    snapshot.teachers.map((teacher) => [teacher.id, teacher]),
  );
  const classes = new Set(
    snapshot.classes.map((schoolClass) => schoolClass.id),
  );
  const subjects = new Set(snapshot.subjects.map((subject) => subject.id));
  const rooms = new Set(snapshot.rooms.map((room) => room.id));
  const roomTypes = new Set(
    snapshot.rooms.flatMap((room) =>
      room.room_type_id ? [room.room_type_id] : [],
    ),
  );
  const teacherLoads = new Map<string, number>();

  for (const assignment of snapshot.assignments) {
    const identity = assignmentIdentity(assignment);
    if (!teachers.has(assignment.teacher_id)) {
      add(
        issue(
          "ASSIGNMENT_TEACHER_UNKNOWN",
          "ERROR",
          `Výuková vazba ${identity} odkazuje na neznámého učitele.`,
          [assignment.id, assignment.teacher_id],
        ),
      );
    }
    if (!classes.has(assignment.class_id)) {
      add(
        issue(
          "ASSIGNMENT_CLASS_UNKNOWN",
          "ERROR",
          `Výuková vazba ${identity} odkazuje na neznámou třídu.`,
          [assignment.id, assignment.class_id],
        ),
      );
    }
    if (!subjects.has(assignment.subject_id)) {
      add(
        issue(
          "ASSIGNMENT_SUBJECT_UNKNOWN",
          "ERROR",
          `Výuková vazba ${identity} odkazuje na neznámý předmět.`,
          [assignment.id, assignment.subject_id],
        ),
      );
    }
    if (
      !Number.isInteger(assignment.weekly_periods) ||
      assignment.weekly_periods < 1
    ) {
      add(
        issue(
          "ASSIGNMENT_WEEKLY_PERIODS_INVALID",
          "ERROR",
          `Výuková vazba ${identity} má neplatný týdenní počet hodin.`,
          [assignment.id],
        ),
      );
    }
    if (assignment.double_periods_count * 2 > assignment.weekly_periods) {
      add(
        issue(
          "ASSIGNMENT_DOUBLE_PERIODS_INVALID",
          "ERROR",
          `Výuková vazba ${identity} požaduje více dvojhodin, než dovoluje týdenní dotace.`,
          [assignment.id],
          "Snižte počet dvojhodin nebo zvyšte týdenní počet hodin.",
        ),
      );
    }
    if (
      assignment.lesson_shape === "DOUBLE" &&
      assignment.weekly_periods % 2 !== 0
    ) {
      add(
        issue(
          "ASSIGNMENT_DOUBLE_SHAPE_ODD",
          "ERROR",
          `Výuková vazba ${identity} typu DOUBLE musí mít sudý počet hodin.`,
          [assignment.id],
        ),
      );
    }
    if (
      assignment.required_room_id &&
      !rooms.has(assignment.required_room_id)
    ) {
      add(
        issue(
          "ASSIGNMENT_ROOM_UNKNOWN",
          "ERROR",
          `Výuková vazba ${identity} odkazuje na neznámou učebnu.`,
          [assignment.id, assignment.required_room_id],
        ),
      );
    }
    if (
      assignment.required_room_type_id &&
      !roomTypes.has(assignment.required_room_type_id)
    ) {
      add(
        issue(
          "ASSIGNMENT_ROOM_TYPE_UNAVAILABLE",
          "ERROR",
          `Pro výukovou vazbu ${identity} neexistuje učebna požadovaného typu.`,
          [assignment.id, assignment.required_room_type_id],
        ),
      );
    }
    teacherLoads.set(
      assignment.teacher_id,
      (teacherLoads.get(assignment.teacher_id) ?? 0) +
        assignment.weekly_periods,
    );
  }

  for (const teacher of snapshot.teachers) {
    const load = teacherLoads.get(teacher.id) ?? 0;
    if (teacher.min_weekly_load != null && load < teacher.min_weekly_load) {
      add(
        issue(
          "TEACHER_MIN_LOAD_VIOLATED",
          "ERROR",
          `Učitel ${teacher.code} má ${load} hodin, minimum je ${teacher.min_weekly_load}.`,
          [teacher.id],
        ),
      );
    }
    if (teacher.max_weekly_load != null && load > teacher.max_weekly_load) {
      add(
        issue(
          "TEACHER_MAX_LOAD_VIOLATED",
          "ERROR",
          `Učitel ${teacher.code} má ${load} hodin, maximum je ${teacher.max_weekly_load}.`,
          [teacher.id],
        ),
      );
    }
    if (load !== teacher.target_weekly_load) {
      add(
        issue(
          "TEACHER_TARGET_LOAD_MISMATCH",
          "WARNING",
          `Učitel ${teacher.code} má přiřazeno ${load} hodin místo cílových ${teacher.target_weekly_load}.`,
          [teacher.id],
          "Ověřte úvazek nebo výukové vazby.",
        ),
      );
    }
  }

  for (const assignment of snapshot.assignments) {
    if (assignment.group === "WHOLE") continue;
    const counterpart = snapshot.assignments.find(
      (candidate) =>
        candidate.id !== assignment.id &&
        candidate.class_id === assignment.class_id &&
        candidate.subject_id === assignment.subject_id &&
        candidate.group !== "WHOLE" &&
        candidate.group !== assignment.group,
    );
    if (!counterpart) {
      add(
        issue(
          "SPLIT_GROUP_COUNTERPART_MISSING",
          "WARNING",
          `Dělená vazba ${assignmentIdentity(assignment)} nemá nalezený protějšek druhé skupiny.`,
          [assignment.id],
          "Doplňte kompatibilní vazbu GROUP_1 nebo GROUP_2.",
        ),
      );
    }
  }

  for (const rule of snapshot.availability) {
    const periods = snapshot.periods_per_day[rule.day];
    if (periods == null || rule.period < 0 || rule.period >= periods) {
      add(
        issue(
          "AVAILABILITY_SLOT_OUT_OF_RANGE",
          "ERROR",
          "Pravidlo dostupnosti odkazuje mimo rozsah pracovního dne.",
          [rule.entity_id],
        ),
      );
    }
  }

  const totalWeeklySlots = snapshot.periods_per_day.reduce(
    (total, periods) => total + periods,
    0,
  );
  const teacherUnavailableSlots = new Map<string, Set<string>>();
  for (const rule of snapshot.availability) {
    if (
      rule.kind !== "UNAVAILABLE" ||
      rule.entity_type !== "TEACHER" ||
      rule.period < 0 ||
      rule.period >= (snapshot.periods_per_day[rule.day] ?? 0)
    ) {
      continue;
    }
    const slots =
      teacherUnavailableSlots.get(rule.entity_id) ?? new Set<string>();
    slots.add(`${rule.day}:${rule.period}`);
    teacherUnavailableSlots.set(rule.entity_id, slots);
  }
  for (const teacher of snapshot.teachers) {
    const required = teacherLoads.get(teacher.id) ?? 0;
    const available =
      totalWeeklySlots - (teacherUnavailableSlots.get(teacher.id)?.size ?? 0);
    if (required > available) {
      add(
        issue(
          "TEACHER_AVAILABLE_SLOT_CAPACITY_EXCEEDED",
          "ERROR",
          `${teacher.first_name} ${teacher.last_name}: ${required} hodin výuky, ale podle zadané dostupnosti má pouze ${available} použitelných hodin. Chybí minimálně ${required - available}.`,
          [teacher.id],
          "Uvolněte některé blokované hodiny nebo přesuňte část výuky na jiného učitele.",
        ),
      );
    }
  }

  const peSubjectIds = new Set(
    snapshot.subjects
      .filter((subject) => subject.code.trim().toUpperCase() === "TV")
      .map((subject) => subject.id),
  );
  const peAssignments = snapshot.assignments.filter((assignment) =>
    peSubjectIds.has(assignment.subject_id),
  );
  const peRoomTypeIds = new Set(
    peAssignments.flatMap((assignment) =>
      assignment.required_room_type_id
        ? [assignment.required_room_type_id]
        : [],
    ),
  );
  for (const subject of snapshot.subjects) {
    if (peSubjectIds.has(subject.id) && subject.default_room_type_id) {
      peRoomTypeIds.add(subject.default_room_type_id);
    }
  }
  const peRequiredRoomIds = new Set(
    peAssignments.flatMap((assignment) =>
      assignment.required_room_id ? [assignment.required_room_id] : [],
    ),
  );
  const peRoomIds = new Set(
    snapshot.rooms
      .filter(
        (room) =>
          peRequiredRoomIds.has(room.id) ||
          (room.room_type_id != null && peRoomTypeIds.has(room.room_type_id)),
      )
      .map((room) => room.id),
  );
  if (peAssignments.length > 0 && peRoomIds.size > 0) {
    const unavailablePeRoomSlots = new Set(
      snapshot.availability
        .filter(
          (rule) =>
            rule.kind === "UNAVAILABLE" &&
            rule.entity_type === "ROOM" &&
            peRoomIds.has(rule.entity_id),
        )
        .map((rule) => `${rule.entity_id}:${rule.day}:${rule.period}`),
    );
    let availablePeRoomPeriods = 0;
    for (let day = 0; day < snapshot.periods_per_day.length; day += 1) {
      const periods = snapshot.periods_per_day[day] ?? 0;
      for (let period = 0; period < periods; period += 1) {
        for (const roomId of peRoomIds) {
          if (!unavailablePeRoomSlots.has(`${roomId}:${day}:${period}`)) {
            availablePeRoomPeriods += 1;
          }
        }
      }
    }
    const requiredPeRoomPeriods = peAssignments.reduce(
      (total, assignment) => total + assignment.weekly_periods,
      0,
    );
    const reserve = availablePeRoomPeriods - requiredPeRoomPeriods;
    if (reserve < 0) {
      add(
        issue(
          "PE_TOTAL_ROOM_CAPACITY_EXCEEDED",
          "ERROR",
          `TV vyžaduje ${requiredPeRoomPeriods} prostorohodin týdně, ale po všech omezeních včetně obsazenosti 1. stupně zbývá jen ${availablePeRoomPeriods}. Chybí minimálně ${Math.abs(reserve)} prostorohodin.`,
          [...peRoomIds],
          "Uvolněte část TV kapacity, přidejte další použitelný prostor nebo upravte časové omezení TV.",
        ),
      );
    } else if (requiredPeRoomPeriods > 0 && reserve <= 5) {
      add(
        issue(
          "PE_TOTAL_ROOM_CAPACITY_TIGHT",
          "WARNING",
          `TV má po započtení 1. stupně rezervu jen ${reserve} prostorohodin týdně. Zadání je velmi těsné.`,
          [...peRoomIds],
        ),
      );
    }
  }

  const sortIssues = (items: ReadinessIssue[]) =>
    items.sort((left, right) =>
      `${left.code}:${left.message}`.localeCompare(
        `${right.code}:${right.message}`,
        "cs",
      ),
    );
  sortIssues(blockers);
  sortIssues(warnings);

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    summary: {
      teachers: snapshot.teachers.length,
      classes: snapshot.classes.length,
      subjects: snapshot.subjects.length,
      rooms: snapshot.rooms.length,
      assignments: snapshot.assignments.length,
      weekly_periods: snapshot.assignments.reduce(
        (total, assignment) => total + assignment.weekly_periods,
        0,
      ),
    },
  };
}
