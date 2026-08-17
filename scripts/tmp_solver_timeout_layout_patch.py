from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"missing patch target in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


main = Path("apps/solver/app/main.py")
replace_once(
    main,
    "from collections import defaultdict\nfrom dataclasses import dataclass\nfrom datetime import UTC, datetime\nfrom typing import Any\n",
    "import os\nimport time\nfrom collections import defaultdict\nfrom dataclasses import dataclass\nfrom datetime import UTC, datetime\nfrom typing import Any\n",
)
replace_once(
    main,
    "DEFAULT_SUBJECT_LATE_WEIGHT = 300\n",
    "DEFAULT_SUBJECT_LATE_WEIGHT = 300\nVERCEL_REQUEST_BUDGET_SECONDS = 270.0\n",
)
replace_once(
    main,
    '''def _search_workers(payload: SolveRequest) -> int:\n    """Keep small tests deterministic and use a CP-SAT portfolio for full schools."""\n    return 8 if payload.time_limit_seconds >= 120 else 1\n\n\n@app.post("/solve", response_model=SolveResponse)\ndef solve(payload: SolveRequest) -> SolveResponse:\n    blocks = _blocks(payload)\n''',
    '''def _search_workers(payload: SolveRequest) -> int:\n    """Keep small tests deterministic and use a CP-SAT portfolio for full schools."""\n    return 8 if payload.time_limit_seconds >= 120 else 1\n\n\ndef _solver_time_limit_seconds(\n    payload: SolveRequest,\n    request_started: float,\n) -> float:\n    requested = float(payload.time_limit_seconds)\n    if os.getenv("VERCEL") != "1":\n        return requested\n    elapsed = max(0.0, time.monotonic() - request_started)\n    remaining_budget = max(1.0, VERCEL_REQUEST_BUDGET_SECONDS - elapsed)\n    return min(requested, remaining_budget)\n\n\n@app.post("/solve", response_model=SolveResponse)\ndef solve(payload: SolveRequest) -> SolveResponse:\n    request_started = time.monotonic()\n    blocks = _blocks(payload)\n''',
)
replace_once(
    main,
    '''    workers = _search_workers(payload)\n    solver = cp_model.CpSolver()\n    solver.parameters.max_time_in_seconds = float(payload.time_limit_seconds)\n''',
    '''    workers = _search_workers(payload)\n    effective_time_limit_seconds = _solver_time_limit_seconds(\n        payload,\n        request_started,\n    )\n    solver = cp_model.CpSolver()\n    solver.parameters.max_time_in_seconds = effective_time_limit_seconds\n''',
)
replace_once(
    main,
    '''                    "details": {\n                        "timeLimitSeconds": payload.time_limit_seconds,\n                        "workers": workers,\n                    },\n''',
    '''                    "details": {\n                        "requestedTimeLimitSeconds": payload.time_limit_seconds,\n                        "effectiveTimeLimitSeconds": effective_time_limit_seconds,\n                        "workers": workers,\n                    },\n''',
)
replace_once(
    main,
    '''    search_diagnostic = (\n        {\n            "code": "PARALLEL_FULL_SCHOOL_SEARCH",\n            "message": (f"Solver použil portfolio {workers} paralelních pracovníků."),\n        }\n        if workers > 1\n        else {\n            "code": "DETERMINISTIC_TEST_MODE",\n            "message": "Solver použil jedno vlákno a pevný random seed.",\n        }\n    )\n    return SolveResponse(\n''',
    '''    search_diagnostic = (\n        {\n            "code": "PARALLEL_FULL_SCHOOL_SEARCH",\n            "message": (f"Solver použil portfolio {workers} paralelních pracovníků."),\n        }\n        if workers > 1\n        else {\n            "code": "DETERMINISTIC_TEST_MODE",\n            "message": "Solver použil jedno vlákno a pevný random seed.",\n        }\n    )\n    runtime_budget_diagnostic = (\n        {\n            "code": "RUNTIME_TIME_BUDGET_APPLIED",\n            "message": (\n                "Produkční výpočet byl ukončen s bezpečnou rezervou před "\n                "serverovým timeoutem, aby bylo možné vrátit a uložit nejlepší "\n                "nalezený návrh."\n            ),\n            "details": {\n                "requestedTimeLimitSeconds": payload.time_limit_seconds,\n                "effectiveTimeLimitSeconds": effective_time_limit_seconds,\n            },\n        }\n        if effective_time_limit_seconds < float(payload.time_limit_seconds)\n        else None\n    )\n    return SolveResponse(\n''',
)
replace_once(
    main,
    '''            search_diagnostic,\n        ],\n        solver_stats={\n''',
    '''            search_diagnostic,\n            *([runtime_budget_diagnostic] if runtime_budget_diagnostic else []),\n        ],\n        solver_stats={\n''',
)
replace_once(
    main,
    '''            "randomSeed": payload.random_seed,\n            "workers": workers,\n''',
    '''            "randomSeed": payload.random_seed,\n            "workers": workers,\n            "requestedTimeLimitSeconds": payload.time_limit_seconds,\n            "effectiveTimeLimitSeconds": effective_time_limit_seconds,\n''',
)

Path("apps/solver/tests/test_runtime_budget.py").write_text(
    '''from app.main import VERCEL_REQUEST_BUDGET_SECONDS, _solver_time_limit_seconds\nfrom app.models import SolveRequest\n\n\ndef test_vercel_budget_leaves_response_headroom(monkeypatch) -> None:\n    monkeypatch.setenv("VERCEL", "1")\n    monkeypatch.setattr("app.main.time.monotonic", lambda: 12.0)\n    payload = SolveRequest(assignments=[], time_limit_seconds=300)\n\n    assert VERCEL_REQUEST_BUDGET_SECONDS == 270.0\n    assert _solver_time_limit_seconds(payload, request_started=0.0) == 258.0\n\n\ndef test_non_vercel_keeps_requested_solver_limit(monkeypatch) -> None:\n    monkeypatch.delenv("VERCEL", raising=False)\n    monkeypatch.setattr("app.main.time.monotonic", lambda: 999.0)\n    payload = SolveRequest(assignments=[], time_limit_seconds=300)\n\n    assert _solver_time_limit_seconds(payload, request_started=0.0) == 300.0\n'''
)

generate = Path("apps/web/app/generate/page.tsx")
replace_once(
    generate,
    '''            <option value={300}>\n              5 minut · nejlepší dostupná optimalizace\n            </option>\n''',
    '''            <option value={300}>\n              5 minut · maximum s bezpečnou rezervou\n            </option>\n''',
)
replace_once(
    generate,
    '''          <p className="mt-2 text-xs text-text-muted">\n            Delší výpočet výrazně pomáhá omezit mezery tříd a učitelů.\n          </p>\n''',
    '''          <p className="mt-2 text-xs text-text-muted">\n            Delší výpočet výrazně pomáhá omezit mezery tříd a učitelů.\n            Pětiminutový režim na produkci ukončí solver s rezervou před\n            serverovým timeoutem, aby se nejlepší nalezený návrh stihl uložit.\n          </p>\n''',
)

timetable = Path("apps/web/app/timetable/page.tsx")
replace_once(
    timetable,
    '  group: "WHOLE" | "GROUP_1" | "GROUP_2";\n',
    '  group: "WHOLE" | "GROUP_1" | "GROUP_2" | "GROUP_3";\n',
)
replace_once(
    timetable,
    '''          <div className="overflow-x-auto rounded-xl border border-border bg-surface">\n            <div className="min-w-[980px]">\n              <div className="grid grid-cols-[96px_repeat(5,minmax(170px,1fr))] border-b border-border bg-surface-subtle">\n''',
    '''          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">\n            <div className="min-w-[1180px]">\n              <div className="grid grid-cols-[88px_repeat(5,minmax(210px,1fr))] border-b border-border bg-surface-subtle">\n''',
)
replace_once(
    timetable,
    '''                    className="border-l border-border p-3 text-sm font-semibold text-text-primary"\n''',
    '''                    className="border-l border-border p-3 text-center text-sm font-semibold text-text-primary"\n''',
)
replace_once(
    timetable,
    '''                    <div className="grid grid-cols-[96px_repeat(5,minmax(170px,1fr))] border-b border-warning-border bg-warning-subtle">\n''',
    '''                    <div className="grid grid-cols-[88px_repeat(5,minmax(210px,1fr))] border-b border-warning-border bg-warning-subtle">\n''',
)
replace_once(
    timetable,
    '''                    className="grid min-h-24 grid-cols-[96px_repeat(5,minmax(170px,1fr))] border-b border-border last:border-b-0"\n''',
    '''                    className="grid min-h-24 grid-cols-[88px_repeat(5,minmax(210px,1fr))] border-b border-border last:border-b-0"\n''',
)
replace_once(
    timetable,
    '''                    <div className="p-3 text-center text-sm font-semibold text-text-muted">\n''',
    '''                    <div className="sticky left-0 z-10 border-r border-border bg-surface px-2 py-3 text-center text-sm font-semibold text-text-muted">\n''',
)
replace_once(
    timetable,
    '''                      const cellLessons = payload?.lessons.filter(\n                        (lesson) =>\n                          lesson.day === day && lesson.period === period,\n                      );\n                      const disabled =\n                        period >= (payload?.periodsPerDay[day] ?? 0);\n                      return (\n                        <div\n                          key={`${day}-${period}`}\n                          className={\n                            disabled\n                              ? "border-l border-border bg-surface-subtle p-2"\n                              : "space-y-2 border-l border-border p-2"\n                          }\n                        >\n                          {cellLessons?.map((lesson) => (\n''',
    '''                      const cellLessons = (payload?.lessons ?? [])\n                        .filter(\n                          (lesson) =>\n                            lesson.day === day && lesson.period === period,\n                        )\n                        .sort((left, right) =>\n                          left.group.localeCompare(right.group),\n                        );\n                      const disabled =\n                        period >= (payload?.periodsPerDay[day] ?? 0);\n                      const lessonLayoutClass =\n                        cellLessons.length >= 3\n                          ? "grid grid-cols-3 gap-1.5"\n                          : cellLessons.length === 2\n                            ? "grid grid-cols-2 gap-2"\n                            : "space-y-2";\n                      return (\n                        <div\n                          key={`${day}-${period}`}\n                          data-testid={`timetable-cell-${day}-${period}`}\n                          data-layout={\n                            cellLessons.length > 1 ? "parallel" : "single"\n                          }\n                          className={\n                            disabled\n                              ? "border-l border-border bg-surface-subtle p-2"\n                              : `border-l border-border p-2 ${lessonLayoutClass}`\n                          }\n                        >\n                          {cellLessons.map((lesson) => (\n''',
)
replace_once(
    timetable,
    '''                              className="w-full rounded-md border border-primary/30 bg-primary-subtle p-2.5 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"\n''',
    '''                              className="group min-w-0 overflow-hidden rounded-xl border border-primary/25 bg-primary-subtle p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"\n''',
)
replace_once(
    timetable,
    '''                              <p className="mt-1 text-xs text-text-secondary">\n                                {view === "class"\n                                  ? lesson.teacher?.code\n                                  : (lesson.schoolClasses\n                                      ?.map((item) => item.code)\n                                      .join(" + ") ?? lesson.schoolClass?.code)}\n                                {lesson.group !== "WHOLE"\n                                  ? ` · ${teachingGroupLabels[lesson.group] ?? lesson.group}`\n                                  : ""}\n                              </p>\n                              <p className="mt-1 text-xs text-text-muted">\n                                {lesson.room?.code ?? "bez učebny"}\n                                {lesson.duration === 2 ? " · dvojhodina" : ""}\n                              </p>\n''',
    '''                              <div className="mt-1 flex min-w-0 items-center gap-1.5">\n                                <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-secondary">\n                                  {view === "class"\n                                    ? lesson.teacher?.code\n                                    : (lesson.schoolClasses\n                                        ?.map((item) => item.code)\n                                        .join(" + ") ?? lesson.schoolClass?.code)}\n                                </span>\n                                {lesson.group !== "WHOLE" ? (\n                                  <span\n                                    className="shrink-0 rounded-md border border-primary/20 bg-surface/70 px-1.5 py-0.5 text-[10px] font-semibold text-primary"\n                                    title={\n                                      teachingGroupLabels[lesson.group] ??\n                                      lesson.group\n                                    }\n                                  >\n                                    {lesson.group === "GROUP_1"\n                                      ? "S1"\n                                      : lesson.group === "GROUP_2"\n                                        ? "S2"\n                                        : "S3"}\n                                  </span>\n                                ) : null}\n                              </div>\n                              <p className="mt-1 truncate text-[11px] text-text-muted">\n                                {lesson.room?.code ?? "bez učebny"}\n                                {lesson.duration === 2 ? " · dvojhodina" : ""}\n                              </p>\n''',
)

rotation_spec = Path("apps/web/e2e/subject-rotation-and-sports.spec.ts")
replace_once(
    rotation_spec,
    '''  await capture(page, "13-vygenerovana-atomicka-rotace.png");\n});\n''',
    '''  await capture(page, "13-vygenerovana-atomicka-rotace.png");\n\n  await page.getByRole("link", { name: "Otevřít návrh" }).click();\n  await expect(page.getByRole("heading", { name: "Kvalita návrhu" })).toBeVisible();\n  const parallelCell = page.locator('[data-layout="parallel"]').first();\n  await expect(parallelCell).toBeVisible();\n  const parallelCards = parallelCell.locator("button");\n  expect(await parallelCards.count()).toBeGreaterThanOrEqual(2);\n  const firstBox = await parallelCards.nth(0).boundingBox();\n  const secondBox = await parallelCards.nth(1).boundingBox();\n  expect(firstBox).not.toBeNull();\n  expect(secondBox).not.toBeNull();\n  expect(Math.abs(firstBox!.y - secondBox!.y)).toBeLessThan(3);\n  expect(secondBox!.x).toBeGreaterThan(firstBox!.x);\n  await capture(page, "14-paralelni-skupiny-vedle-sebe.png");\n});\n''',
)
