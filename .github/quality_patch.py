from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"Expected source fragment not found in {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


# 1) Solver priorities: teacher compactness and subject distribution must matter at school scale.
replace_once(
    "apps/solver/app/models.py",
    '''COMPACTNESS_MINIMUMS = {
    "teacher_gap": 1_000,
    "class_gap": 2_000,
    "discouraged_slot": 25,
    "preferred_slot_bonus": 3,
    "same_day_concentration": 50,
    "late_period": 10,
    "rotation_spread": 75,
}
''',
    '''COMPACTNESS_MINIMUMS = {
    "teacher_gap": 6_000,
    "class_gap": 2_000,
    "discouraged_slot": 25,
    "preferred_slot_bonus": 3,
    "same_day_concentration": 2_500,
    "late_period": 50,
    "rotation_spread": 75,
}
''',
)
replace_once(
    "apps/solver/app/models.py",
    '''    teacher_gap: int = Field(default=1_000, ge=0, le=10_000)
    class_gap: int = Field(default=2_000, ge=0, le=10_000)
    discouraged_slot: int = Field(default=25, ge=0, le=10_000)
    preferred_slot_bonus: int = Field(default=3, ge=0, le=10_000)
    same_day_concentration: int = Field(default=50, ge=0, le=10_000)
    late_period: int = Field(default=10, ge=0, le=10_000)
''',
    '''    teacher_gap: int = Field(default=6_000, ge=0, le=10_000)
    class_gap: int = Field(default=2_000, ge=0, le=10_000)
    discouraged_slot: int = Field(default=25, ge=0, le=10_000)
    preferred_slot_bonus: int = Field(default=3, ge=0, le=10_000)
    same_day_concentration: int = Field(default=2_500, ge=0, le=10_000)
    late_period: int = Field(default=50, ge=0, le=10_000)
''',
)

# 2) School-day policy and day-load balancing in the CP-SAT objective.
replace_once(
    "apps/solver/app/main.py",
    '''AFTERNOON_START_PERIOD = 5
SUBJECT_LATE_WEIGHTS = {''',
    '''# Periods are zero-based. Afternoon starts after the lunch break, i.e. 7th lesson.
AFTERNOON_START_PERIOD = 6
ALLOWED_CLASS_AFTERNOON_DAYS = {1, 2, 3}  # Tuesday, Wednesday, Thursday
CLASS_DAY_BALANCE_WEIGHT = 50_000
SUBJECT_LATE_WEIGHTS = {''',
)

anchor = '''def _search_workers(payload: SolveRequest) -> int:
    """Keep small tests deterministic and use a CP-SAT portfolio for full schools."""
    return 8 if payload.time_limit_seconds >= 120 else 1
'''
policy = '''def _add_secondary_class_day_policy(
    model: cp_model.CpModel,
    objective_terms: list[cp_model.LinearExpr],
    class_slots: dict[tuple[str, int, int], list[cp_model.IntVar]],
    required_periods_by_class: dict[str, int],
    periods_per_day: list[int],
) -> None:
    """Enforce the agreed second-stage school-day shape and strongly balance daily load."""
    if len(periods_per_day) != 5:
        return

    day_count = len(periods_per_day)
    for class_id, weekly_periods in sorted(required_periods_by_class.items()):
        if weekly_periods < day_count:
            continue

        # A 29h class must have at least 5 lessons every day, a 31h/34h class at least 6.
        # This rules out pathological 3h/4h days while keeping one-period flexibility.
        minimum_daily_load = max(1, ((weekly_periods + day_count - 1) // day_count) - 1)
        day_loads: list[cp_model.IntVar] = []
        afternoon_used: list[cp_model.IntVar] = []

        for day, periods in enumerate(periods_per_day):
            occupancy = _occupancy_variables(
                model,
                class_slots,
                class_id,
                day,
                periods,
                "class_day_policy",
            )
            load = model.new_int_var(0, periods, f"class_load_{class_id}_{day}")
            model.add(load == sum(occupancy))
            model.add(load >= minimum_daily_load)
            day_loads.append(load)

            late_slots = occupancy[AFTERNOON_START_PERIOD:]
            afternoon = model.new_bool_var(f"class_afternoon_{class_id}_{day}")
            if late_slots:
                model.add(sum(late_slots) >= afternoon)
                model.add(sum(late_slots) <= len(late_slots) * afternoon)
            else:
                model.add(afternoon == 0)
            if day not in ALLOWED_CLASS_AFTERNOON_DAYS:
                model.add(afternoon == 0)
            afternoon_used.append(afternoon)

        # Children must not have afternoon teaching on two consecutive school days.
        for day in range(day_count - 1):
            model.add(afternoon_used[day] + afternoon_used[day + 1] <= 1)

        max_load = model.new_int_var(0, max(periods_per_day), f"class_max_load_{class_id}")
        min_load = model.new_int_var(0, max(periods_per_day), f"class_min_load_{class_id}")
        model.add_max_equality(max_load, day_loads)
        model.add_min_equality(min_load, day_loads)
        spread = model.new_int_var(0, max(periods_per_day), f"class_load_spread_{class_id}")
        model.add(spread == max_load - min_load)
        objective_terms.append(spread * CLASS_DAY_BALANCE_WEIGHT)


''' + anchor
replace_once("apps/solver/app/main.py", anchor, policy)
replace_once(
    "apps/solver/app/main.py",
    '''    _forbid_regular_class_gaps(
        model,
        class_all_slots,
        required_periods_by_class,
        payload.periods_per_day,
    )

    blocks_by_assignment: dict[str, list[Block]] = defaultdict(list)
''',
    '''    _forbid_regular_class_gaps(
        model,
        class_all_slots,
        required_periods_by_class,
        payload.periods_per_day,
    )
    _add_secondary_class_day_policy(
        model,
        objective_terms,
        class_all_slots,
        required_periods_by_class,
        payload.periods_per_day,
    )

    blocks_by_assignment: dict[str, list[Block]] = defaultdict(list)
''',
)
replace_once(
    "apps/solver/app/main.py",
    '''            {
                "code": "PEDAGOGICAL_AFTERNOON_PRIORITY",
                "message": (
                    "Pozdní hodiny přednostně využívají pohybové, výtvarné a praktické předměty před matematikou, jazyky a informatikou."
                ),
            },
            search_diagnostic,
''',
    '''            {
                "code": "PEDAGOGICAL_AFTERNOON_PRIORITY",
                "message": (
                    "Pozdní hodiny přednostně využívají pohybové, výtvarné a praktické předměty před matematikou, jazyky a informatikou."
                ),
            },
            {
                "code": "SECONDARY_CLASS_DAY_POLICY",
                "message": (
                    "Odpolední výuka tříd je povolená jen v úterý, středu a čtvrtek, nesmí být dva dny po sobě a denní zátěž je silně vyrovnávaná."
                ),
            },
            search_diagnostic,
''',
)

# 3) Python scoring: parallel/shared lessons represent one occupied class period, not 2-3 periods.
scoring_py = Path("apps/solver/app/scoring.py")
text = scoring_py.read_text()
text = text.replace(
'''    for lesson in lessons:
        entity_id = getattr(lesson, attribute)
        for period in range(lesson.period, lesson.period + lesson.duration):
            result[(entity_id, lesson.day)].add(period)
''',
'''    for lesson in lessons:
        entity_ids = (
            [lesson.class_id, *lesson.additional_class_ids]
            if attribute == "class_id"
            else [getattr(lesson, attribute)]
        )
        for entity_id in entity_ids:
            for period in range(lesson.period, lesson.period + lesson.duration):
                result[(entity_id, lesson.day)].add(period)
''')
text = text.replace(
'''        if entity_type == AvailabilityEntityType.CLASS and lesson.class_id == entity_id:
            return True
''',
'''        if entity_type == AvailabilityEntityType.CLASS and entity_id in [lesson.class_id, *lesson.additional_class_ids]:
            return True
''')
text = text.replace(
'''    subject_days: dict[tuple[str, str, int], int] = defaultdict(int)
    for lesson in lessons:
        assignment_days[(lesson.assignment_id, lesson.day)].append(lesson)
        subject_days[(lesson.class_id, lesson.subject_id, lesson.day)] += lesson.duration
''',
'''    subject_days: dict[tuple[str, str, int], set[int]] = defaultdict(set)
    for lesson in lessons:
        assignment_days[(lesson.assignment_id, lesson.day)].append(lesson)
        for class_id in [lesson.class_id, *lesson.additional_class_ids]:
            for period in range(lesson.period, lesson.period + lesson.duration):
                subject_days[(class_id, lesson.subject_id, lesson.day)].add(period)
''')
text = text.replace(
'''    for (class_id, subject_id, day), periods in sorted(subject_days.items()):
        if periods > 2:
''',
'''    for (class_id, subject_id, day), occupied_periods in sorted(subject_days.items()):
        periods = len(occupied_periods)
        if periods > 2:
''')
old_late = '''    class_occupancy = _occupancy(lessons, "class_id")
    for (class_id, day), occupied in sorted(class_occupancy.items()):
        last_period = max(occupied)
        if last_period >= max(6, payload.periods_per_day[day] - 1):
            _deduct(
                categories,
                incidents,
                category="day_edges",
                points=1,
                code="LATE_CLASS_FINISH",
                message=f"Třída {class_id} končí pozdě.",
                entity_ids=[class_id],
                day=day,
                period=last_period,
                suggestion="Zvažte přesun některé výuky do dřívějšího slotu.",
            )
'''
new_late = '''    class_occupancy = _occupancy(lessons, "class_id")
    class_ids = sorted({class_id for class_id, _day in class_occupancy})
    if len(payload.periods_per_day) == 5:
        for class_id in class_ids:
            loads = [len(class_occupancy.get((class_id, day), set())) for day in range(5)]
            weekly_periods = sum(loads)
            if weekly_periods < 5:
                continue
            minimum_daily_load = max(1, ((weekly_periods + 4) // 5) - 1)
            for day, load in enumerate(loads):
                occupied = class_occupancy.get((class_id, day), set())
                if load < minimum_daily_load:
                    _deduct(
                        categories,
                        incidents,
                        category="day_edges",
                        points=2,
                        code="CLASS_DAY_TOO_SHORT",
                        message=f"Třída {class_id} má nepřiměřeně krátký vyučovací den.",
                        entity_ids=[class_id],
                        day=day,
                        suggestion="Rozložte týdenní výuku rovnoměrněji mezi pracovní dny.",
                    )
                if any(period >= 6 for period in occupied) and day not in {1, 2, 3}:
                    _deduct(
                        categories,
                        incidents,
                        category="day_edges",
                        points=3,
                        code="CLASS_AFTERNOON_FORBIDDEN_DAY",
                        message=f"Třída {class_id} má odpolední výuku v nevhodný den.",
                        entity_ids=[class_id],
                        day=day,
                        suggestion="Odpolední výuku plánujte pouze na úterý, středu nebo čtvrtek.",
                    )
            afternoon_days = {
                day
                for day in range(5)
                if any(period >= 6 for period in class_occupancy.get((class_id, day), set()))
            }
            for day in range(4):
                if day in afternoon_days and day + 1 in afternoon_days:
                    _deduct(
                        categories,
                        incidents,
                        category="day_edges",
                        points=2,
                        code="CONSECUTIVE_CLASS_AFTERNOONS",
                        message=f"Třída {class_id} má odpolední výuku dva dny po sobě.",
                        entity_ids=[class_id],
                        day=day + 1,
                        suggestion="Oddělte odpolední dny alespoň jedním dnem bez 7.–8. hodiny.",
                    )
            spread = max(loads) - min(loads)
            if spread > 2:
                _deduct(
                    categories,
                    incidents,
                    category="day_edges",
                    points=min(3, spread - 2),
                    code="CLASS_DAY_LOAD_IMBALANCE",
                    message=f"Třída {class_id} má výrazně nevyrovnanou délku vyučovacích dnů.",
                    entity_ids=[class_id],
                    suggestion="Vyrovnejte počet hodin mezi jednotlivými dny.",
                )
'''
if new_late not in text:
    if old_late not in text:
        raise RuntimeError("Python late scoring fragment not found")
    text = text.replace(old_late, new_late, 1)
scoring_py.write_text(text)

# 4) Browser/local scoring must use exactly the same semantics.
scoring_ts = Path("apps/web/lib/domain/scoring.ts")
text = scoring_ts.read_text()
text = text.replace(
'''  for (const lesson of lessons) {
    const key = `${lesson[attribute]}:${lesson.day}`;
    const periods = result.get(key) ?? new Set<number>();
    for (
      let period = lesson.period;
      period < lesson.period + lesson.duration;
      period += 1
    ) {
      periods.add(period);
    }
    result.set(key, periods);
  }
''',
'''  for (const lesson of lessons) {
    const entityIds =
      attribute === "class_id"
        ? [lesson.class_id, ...(lesson.additional_class_ids ?? [])]
        : [lesson[attribute]];
    for (const entityId of entityIds) {
      const key = `${entityId}:${lesson.day}`;
      const periods = result.get(key) ?? new Set<number>();
      for (
        let period = lesson.period;
        period < lesson.period + lesson.duration;
        period += 1
      ) {
        periods.add(period);
      }
      result.set(key, periods);
    }
  }
''')
text = text.replace(
'''    if (entityType === "CLASS") return lesson.class_id === entityId;
''',
'''    if (entityType === "CLASS")
      return [lesson.class_id, ...(lesson.additional_class_ids ?? [])].includes(
        entityId,
      );
''')
text = text.replace(
'''  const subjectDays = new Map<string, number>();
  for (const lesson of lessons) {
    const assignmentKey = `${lesson.assignment_id}:${lesson.day}`;
    assignmentDays.set(assignmentKey, [
      ...(assignmentDays.get(assignmentKey) ?? []),
      lesson,
    ]);
    const subjectKey = `${lesson.class_id}:${lesson.subject_id}:${lesson.day}`;
    subjectDays.set(
      subjectKey,
      (subjectDays.get(subjectKey) ?? 0) + lesson.duration,
    );
  }
''',
'''  const subjectDays = new Map<string, Set<number>>();
  for (const lesson of lessons) {
    const assignmentKey = `${lesson.assignment_id}:${lesson.day}`;
    assignmentDays.set(assignmentKey, [
      ...(assignmentDays.get(assignmentKey) ?? []),
      lesson,
    ]);
    for (const classId of [
      lesson.class_id,
      ...(lesson.additional_class_ids ?? []),
    ]) {
      const subjectKey = `${classId}:${lesson.subject_id}:${lesson.day}`;
      const occupiedPeriods = subjectDays.get(subjectKey) ?? new Set<number>();
      for (
        let period = lesson.period;
        period < lesson.period + lesson.duration;
        period += 1
      ) {
        occupiedPeriods.add(period);
      }
      subjectDays.set(subjectKey, occupiedPeriods);
    }
  }
''')
text = text.replace(
'''  for (const [key, periods] of [...subjectDays.entries()].sort()) {
    if (periods <= 2) continue;
''',
'''  for (const [key, occupiedPeriods] of [...subjectDays.entries()].sort()) {
    const periods = occupiedPeriods.size;
    if (periods <= 2) continue;
''')
old_ts_late = '''  for (const [key, occupied] of [
    ...occupancy(lessons, "class_id").entries(),
  ].sort()) {
    const [classId, dayValue] = key.split(":");
    const day = Number(dayValue);
    const lastPeriod = Math.max(...occupied);
    if (lastPeriod >= Math.max(6, snapshot.periods_per_day[day] - 1)) {
      deduct(categories, incidents, {
        category: "day_edges",
        code: "LATE_CLASS_FINISH",
        points: 1,
        message: `Třída ${classId} končí pozdě.`,
        entity_ids: [classId],
        day,
        period: lastPeriod,
        suggestion: "Zvažte přesun některé výuky do dřívějšího slotu.",
      });
    }
  }
'''
new_ts_late = '''  const classOccupancy = occupancy(lessons, "class_id");
  const classIds = [
    ...new Set([...classOccupancy.keys()].map((key) => key.split(":")[0]!)),
  ].sort();
  if (snapshot.periods_per_day.length === 5) {
    for (const classId of classIds) {
      const loads = Array.from({ length: 5 }, (_, day) =>
        classOccupancy.get(`${classId}:${day}`)?.size ?? 0,
      );
      const weeklyPeriods = loads.reduce((sum, value) => sum + value, 0);
      if (weeklyPeriods < 5) continue;
      const minimumDailyLoad = Math.max(1, Math.ceil(weeklyPeriods / 5) - 1);
      const afternoonDays = new Set<number>();
      loads.forEach((load, day) => {
        const occupied = classOccupancy.get(`${classId}:${day}`) ?? new Set();
        if (load < minimumDailyLoad) {
          deduct(categories, incidents, {
            category: "day_edges",
            code: "CLASS_DAY_TOO_SHORT",
            points: 2,
            message: `Třída ${classId} má nepřiměřeně krátký vyučovací den.`,
            entity_ids: [classId],
            day,
            suggestion: "Rozložte týdenní výuku rovnoměrněji mezi pracovní dny.",
          });
        }
        if ([...occupied].some((period) => period >= 6)) {
          afternoonDays.add(day);
          if (![1, 2, 3].includes(day)) {
            deduct(categories, incidents, {
              category: "day_edges",
              code: "CLASS_AFTERNOON_FORBIDDEN_DAY",
              points: 3,
              message: `Třída ${classId} má odpolední výuku v nevhodný den.`,
              entity_ids: [classId],
              day,
              suggestion:
                "Odpolední výuku plánujte pouze na úterý, středu nebo čtvrtek.",
            });
          }
        }
      });
      for (let day = 0; day < 4; day += 1) {
        if (afternoonDays.has(day) && afternoonDays.has(day + 1)) {
          deduct(categories, incidents, {
            category: "day_edges",
            code: "CONSECUTIVE_CLASS_AFTERNOONS",
            points: 2,
            message: `Třída ${classId} má odpolední výuku dva dny po sobě.`,
            entity_ids: [classId],
            day: day + 1,
            suggestion:
              "Oddělte odpolední dny alespoň jedním dnem bez 7.–8. hodiny.",
          });
        }
      }
      const spread = Math.max(...loads) - Math.min(...loads);
      if (spread > 2) {
        deduct(categories, incidents, {
          category: "day_edges",
          code: "CLASS_DAY_LOAD_IMBALANCE",
          points: Math.min(3, spread - 2),
          message: `Třída ${classId} má výrazně nevyrovnanou délku vyučovacích dnů.`,
          entity_ids: [classId],
          suggestion: "Vyrovnejte počet hodin mezi jednotlivými dny.",
        });
      }
    }
  }
'''
if new_ts_late not in text:
    if old_ts_late not in text:
        raise RuntimeError("TypeScript late scoring fragment not found")
    text = text.replace(old_ts_late, new_ts_late, 1)
scoring_ts.write_text(text)

# 5) Regression tests.
test_solve = Path("apps/solver/tests/test_solve.py")
text = test_solve.read_text()
text = text.replace(
'''    assert weights.teacher_gap == 1_000
    assert weights.class_gap == 2_000
    assert weights.discouraged_slot == 25
    assert weights.preferred_slot_bonus == 3
    assert weights.same_day_concentration == 50
    assert weights.late_period == 10
''',
'''    assert weights.teacher_gap == 6_000
    assert weights.class_gap == 2_000
    assert weights.discouraged_slot == 25
    assert weights.preferred_slot_bonus == 3
    assert weights.same_day_concentration == 2_500
    assert weights.late_period == 50
''')
append = r'''


def test_secondary_class_day_policy_balances_34_hours_and_separates_afternoons() -> None:
    assignments = [
        {
            "id": f"lesson-{index}",
            "teacher_id": f"teacher-{index}",
            "class_id": "8a",
            "subject_id": f"subject-{index}",
            "weekly_periods": 1,
        }
        for index in range(34)
    ]
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [8, 8, 8, 8, 8],
            "assignments": assignments,
            "time_limit_seconds": 10,
        },
    )
    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    loads = [0, 0, 0, 0, 0]
    for lesson in lessons:
        loads[lesson["day"]] += lesson["duration"]
    assert loads == [6, 8, 6, 8, 6]
    afternoon_days = {
        lesson["day"]
        for lesson in lessons
        if lesson["period"] + lesson["duration"] - 1 >= 6
    }
    assert afternoon_days == {1, 3}


def test_parallel_language_groups_count_as_one_class_period_in_score() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2],
            "subjects": [{"id": "english", "code": "JAZ1"}],
            "assignments": [
                {
                    "id": f"english-g{group}",
                    "teacher_id": f"teacher-{group}",
                    "class_id": "7a",
                    "subject_id": "english",
                    "group": f"GROUP_{group}",
                    "weekly_periods": 1,
                    "parallel_key": "7a-english",
                }
                for group in (1, 2, 3)
            ],
        },
    )
    assert response.status_code == 200, response.text
    score = response.json()["score"]
    assert score["categories"]["distribution"] == 15
    assert score["categories"]["class_compactness"] == 25
'''
if "test_secondary_class_day_policy_balances_34_hours" not in text:
    text += append

test_solve.write_text(text)

# Browser-side scoring regression for a three-way parallel lesson.
domain_test = Path("apps/web/tests/domain.test.ts")
text = domain_test.read_text()
append_ts = r'''

test("parallel language groups count as one class period in quality score", () => {
  const source = snapshot();
  source.teachers.push({
    id: "teacher-3",
    code: "TRE",
    first_name: "Třetí",
    last_name: "Učitel",
    target_weekly_load: 1,
  });
  source.assignments.push(
    {
      id: "english-6a-g2",
      code: "6A-AJ-G2",
      teacher_id: "teacher-1",
      class_id: "class-6a",
      subject_id: "english",
      group: "GROUP_2",
      weekly_periods: 1,
      lesson_shape: "SINGLE",
      double_periods_count: 0,
    },
    {
      id: "english-6a-g3",
      code: "6A-AJ-G3",
      teacher_id: "teacher-3",
      class_id: "class-6a",
      subject_id: "english",
      group: "GROUP_3",
      weekly_periods: 1,
      lesson_shape: "SINGLE",
      double_periods_count: 0,
    },
  );
  const timetable = lessons();
  timetable.push(
    {
      id: "lesson-4",
      block_id: "english-6a-g2:0",
      assignment_id: "english-6a-g2",
      teacher_id: "teacher-1",
      class_id: "class-6a",
      subject_id: "english",
      group: "GROUP_2",
      room_id: null,
      day: 0,
      period: 1,
      duration: 1,
      locked: false,
      origin: "SOLVER",
    },
    {
      id: "lesson-5",
      block_id: "english-6a-g3:0",
      assignment_id: "english-6a-g3",
      teacher_id: "teacher-3",
      class_id: "class-6a",
      subject_id: "english",
      group: "GROUP_3",
      room_id: null,
      day: 0,
      period: 1,
      duration: 1,
      locked: false,
      origin: "SOLVER",
    },
  );
  const score = scoreSchedule(source, timetable);
  assert.equal(score.valid, true);
  assert.equal(score.categories.distribution, 15);
  assert.equal(score.categories.class_compactness, 25);
});
'''
if "parallel language groups count as one class period in quality score" not in text:
    text += append_ts

domain_test.write_text(text)
