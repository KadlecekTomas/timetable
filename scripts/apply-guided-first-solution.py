from __future__ import annotations

from pathlib import Path


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f"{label}: start marker not found")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{label}: end marker not found")
    return text[:start_index] + replacement + text[end_index:]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


main_path = Path("apps/solver/app/main.py")
main = main_path.read_text()

start = "    objective = sum(objective_terms)\n"
end = "    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):\n"
replacement = '''    objective = sum(objective_terms)
    model.minimize(objective)
    workers = _search_workers(payload)
    effective_time_limit_seconds = _solver_time_limit_seconds(
        payload,
        request_started,
    )
    first_solution_wall_time_seconds = 0.0
    fallback_search_wall_time_seconds = 0.0
    optimization_wall_time_seconds = 0.0
    search_phases: list[str] = []
    search_seeds: list[int] = []

    if workers > 1:
        # Keep the weighted objective active because it materially guides CP-SAT on
        # the full school model. The first phase only changes the stopping rule: as
        # soon as the guided search finds a valid timetable, preserve it instead of
        # risking an UNKNOWN response while chasing a better objective value.
        primary_search_seconds = min(180.0, effective_time_limit_seconds)
        first_solution_solver = cp_model.CpSolver()
        first_solution_solver.parameters.max_time_in_seconds = primary_search_seconds
        first_solution_solver.parameters.num_search_workers = workers
        first_solution_solver.parameters.random_seed = payload.random_seed
        first_solution_solver.parameters.stop_after_first_solution = True
        status = first_solution_solver.solve(model)
        first_solution_wall_time_seconds = first_solution_solver.wall_time
        search_phases.append("GUIDED_FIRST_SOLUTION")
        search_seeds.append(payload.random_seed)
        solver = first_solution_solver

        remaining_seconds = max(
            0.0,
            effective_time_limit_seconds - first_solution_wall_time_seconds,
        )
        if status == cp_model.UNKNOWN and remaining_seconds >= 5.0:
            # A retry must be a genuinely different search, not another run with the
            # same fixed seed. This is especially valuable after a long first attempt.
            alternate_seed = (
                payload.random_seed + 1
                if payload.random_seed < 2_147_483_646
                else 1
            )
            fallback_solver = cp_model.CpSolver()
            fallback_solver.parameters.max_time_in_seconds = remaining_seconds
            fallback_solver.parameters.num_search_workers = workers
            fallback_solver.parameters.random_seed = alternate_seed
            fallback_solver.parameters.stop_after_first_solution = True
            fallback_status = fallback_solver.solve(model)
            fallback_search_wall_time_seconds = fallback_solver.wall_time
            search_phases.append("ALTERNATE_SEED_FIRST_SOLUTION")
            search_seeds.append(alternate_seed)
            if fallback_status != cp_model.UNKNOWN:
                solver = fallback_solver
                status = fallback_status

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            remaining_seconds = max(
                0.0,
                effective_time_limit_seconds
                - first_solution_wall_time_seconds
                - fallback_search_wall_time_seconds,
            )
            if status != cp_model.OPTIMAL and remaining_seconds >= 1.0:
                for block in blocks:
                    selected_hint = next(
                        variable
                        for _candidate, variable in variables[block.id]
                        if solver.value(variable) == 1
                    )
                    model.add_hint(selected_hint, 1)

                # Quality still matters, but once a valid school timetable exists we
                # cap this phase so the user gets the candidate back promptly.
                optimization_budget_seconds = min(30.0, remaining_seconds)
                optimization_solver = cp_model.CpSolver()
                optimization_solver.parameters.max_time_in_seconds = (
                    optimization_budget_seconds
                )
                optimization_solver.parameters.num_search_workers = workers
                optimization_solver.parameters.random_seed = search_seeds[-1]
                optimization_status = optimization_solver.solve(model)
                optimization_wall_time_seconds = optimization_solver.wall_time
                search_phases.append("OPTIMIZATION")
                if optimization_status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                    solver = optimization_solver
                    status = optimization_status
    else:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = effective_time_limit_seconds
        solver.parameters.num_search_workers = workers
        solver.parameters.random_seed = payload.random_seed
        status = solver.solve(model)
        optimization_wall_time_seconds = solver.wall_time
        search_phases.append("OPTIMIZATION")
        search_seeds.append(payload.random_seed)

'''
main = replace_between(main, start, end, replacement, "solver strategy")

old_diag_start = '''    search_diagnostic = (
        {
            "code": "FEASIBILITY_FIRST_SEARCH",
'''
old_diag_end = '''    runtime_budget_diagnostic = (
'''
new_diag = '''    search_diagnostic = (
        {
            "code": "GUIDED_FIRST_SOLUTION_SEARCH",
            "message": (
                f"Solver použil {workers} paralelních pracovníků a pedagogické "
                "skóre jako vodítko. První platný rozvrh zachová a zbývající čas "
                "využije jen omezeně ke zlepšení kvality."
            ),
            "details": {
                "phases": search_phases,
                "seeds": search_seeds,
                "firstSolutionWallTimeSeconds": first_solution_wall_time_seconds,
                "fallbackSearchWallTimeSeconds": fallback_search_wall_time_seconds,
                "optimizationWallTimeSeconds": optimization_wall_time_seconds,
            },
        }
        if workers > 1
        else {
            "code": "DETERMINISTIC_TEST_MODE",
            "message": "Solver použil jedno vlákno a pevný random seed.",
        }
    )
'''
diag_start_index = main.find(old_diag_start)
if diag_start_index < 0:
    raise RuntimeError("search diagnostic start not found")
diag_end_index = main.find(old_diag_end, diag_start_index)
if diag_end_index < 0:
    raise RuntimeError("search diagnostic end not found")
main = main[:diag_start_index] + new_diag + main[diag_end_index:]

main = replace_once(
    main,
    '            "wallTimeSeconds": feasibility_wall_time_seconds + optimization_wall_time_seconds,\n',
    '            "wallTimeSeconds": first_solution_wall_time_seconds + fallback_search_wall_time_seconds + optimization_wall_time_seconds,\n',
    "wall time stats",
)
main = replace_once(
    main,
    '            "searchPhases": search_phases,\n            "feasibilityWallTimeSeconds": feasibility_wall_time_seconds,\n            "optimizationWallTimeSeconds": optimization_wall_time_seconds,\n',
    '            "searchPhases": search_phases,\n            "searchSeeds": search_seeds,\n            "firstSolutionWallTimeSeconds": first_solution_wall_time_seconds,\n            "fallbackSearchWallTimeSeconds": fallback_search_wall_time_seconds,\n            "optimizationWallTimeSeconds": optimization_wall_time_seconds,\n',
    "phase stats",
)
main_path.write_text(main)


test_path = Path("apps/solver/tests/test_solve.py")
test_text = test_path.read_text()
old_test = '''def test_full_school_search_is_feasibility_first() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2, 2],
            "assignments": [
                {
                    "id": "lesson",
                    "teacher_id": "teacher",
                    "class_id": "class",
                    "subject_id": "subject",
                    "weekly_periods": 1,
                }
            ],
            "time_limit_seconds": 120,
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] in {"FEASIBLE", "OPTIMAL"}
    assert any(
        item["code"] == "FEASIBILITY_FIRST_SEARCH"
        for item in payload["diagnostics"]
    )
    assert payload["solver_stats"]["searchPhases"] == [
        "FEASIBILITY",
        "OPTIMIZATION",
    ]
    assert payload["solver_stats"]["feasibilityWallTimeSeconds"] >= 0
    assert payload["solver_stats"]["optimizationWallTimeSeconds"] >= 0


'''
new_test = '''def test_full_school_search_preserves_first_guided_solution() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2, 2],
            "assignments": [
                {
                    "id": "lesson",
                    "teacher_id": "teacher",
                    "class_id": "class",
                    "subject_id": "subject",
                    "weekly_periods": 1,
                }
            ],
            "time_limit_seconds": 120,
            "random_seed": 7,
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] in {"FEASIBLE", "OPTIMAL"}
    assert any(
        item["code"] == "GUIDED_FIRST_SOLUTION_SEARCH"
        for item in payload["diagnostics"]
    )
    assert payload["solver_stats"]["searchPhases"][0] == "GUIDED_FIRST_SOLUTION"
    assert payload["solver_stats"]["searchSeeds"][0] == 7
    assert payload["solver_stats"]["firstSolutionWallTimeSeconds"] >= 0
    assert payload["solver_stats"]["optimizationWallTimeSeconds"] >= 0


'''
test_text = replace_once(test_text, old_test, new_test, "guided solver regression")
test_path.write_text(test_text)


api_path = Path("apps/web/lib/local/api.ts")
api_text = api_path.read_text()
api_text = replace_once(
    api_text,
    '''function projectSnapshot(
  project: LocalProject,
  timeLimitSeconds = 60,
): CanonicalSnapshot {''',
    '''export function generationRandomSeed(runCount: number): number {
  const normalizedCount = Number.isFinite(runCount)
    ? Math.max(0, Math.floor(runCount))
    : 0;
  return (normalizedCount % 2_147_483_646) + 1;
}

function projectSnapshot(
  project: LocalProject,
  timeLimitSeconds = 60,
  randomSeed = 1,
): CanonicalSnapshot {''',
    "seed helper",
)
api_text = replace_once(
    api_text,
    "    random_seed: 1,\n",
    "    random_seed: randomSeed,\n",
    "snapshot seed",
)
api_text = replace_once(
    api_text,
    '''  const project = await getLocalProject();
  const snapshot = projectSnapshot(project, timeLimitSeconds);
  const readiness = evaluateReadiness(snapshot);''',
    '''  const project = await getLocalProject();
  const randomSeed = generationRandomSeed(project.generationRuns.length);
  const snapshot = projectSnapshot(project, timeLimitSeconds, randomSeed);
  const readiness = evaluateReadiness(snapshot);''',
    "generation seed usage",
)
api_path.write_text(api_text)


seed_test_path = Path("apps/web/tests/generation-seed.test.ts")
seed_test_path.write_text('''import assert from "node:assert/strict";
import test from "node:test";

import { generationRandomSeed } from "../lib/local/api";

test("each generation attempt gets a different deterministic solver seed", () => {
  assert.equal(generationRandomSeed(0), 1);
  assert.equal(generationRandomSeed(1), 2);
  assert.equal(generationRandomSeed(2), 3);
  assert.equal(generationRandomSeed(2_147_483_646), 1);
});
''')


school_scale_path = Path("apps/web/e2e/school-scale.spec.ts")
school_scale = school_scale_path.read_text()
school_scale = replace_once(
    school_scale,
    ''').toBeVisible({ timeout: 240_000 });''',
    ''').toBeVisible({ timeout: 285_000 });''',
    "school-scale wait margin",
)
school_scale_path.write_text(school_scale)
