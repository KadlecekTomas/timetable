from __future__ import annotations

import re
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


main_path = Path("apps/solver/app/main.py")
main = main_path.read_text()

solve_pattern = re.compile(
    r"    model\.minimize\(sum\(objective_terms\)\)\n\n"
    r"    workers = _search_workers\(payload\)\n"
    r"    effective_time_limit_seconds = _solver_time_limit_seconds\(\n"
    r"        payload,\n"
    r"        request_started,\n"
    r"    \)\n"
    r"    solver = cp_model\.CpSolver\(\)\n"
    r"    solver\.parameters\.max_time_in_seconds = effective_time_limit_seconds\n"
    r"    solver\.parameters\.num_search_workers = workers\n"
    r"    solver\.parameters\.random_seed = payload\.random_seed\n"
    r"    status = solver\.solve\(model\)\n\n"
    r"    if status not in \(cp_model\.OPTIMAL, cp_model\.FEASIBLE\):\n"
    r"        if status == cp_model\.UNKNOWN:\n"
    r"            diagnostics = \[\n"
    r"                \{\n"
    r"                    \"code\": \"SEARCH_LIMIT_EXCEEDED\",\n"
    r"                    \"message\": \(\"Solver v časovém limitu nenalezl kandidáta\. To samo o sobě nedokazuje, že model nemá řešení\.\"\),\n"
    r"                    \"entityIds\": \[\],\n"
    r"                    \"details\": \{\n"
    r"                        \"requestedTimeLimitSeconds\": payload\.time_limit_seconds,\n"
    r"                        \"effectiveTimeLimitSeconds\": effective_time_limit_seconds,\n"
    r"                        \"workers\": workers,\n"
    r"                    \},\n"
    r"                \}\n"
    r"            \]\n"
    r"            response_code = \"SEARCH_LIMIT_EXCEEDED\"\n"
    r"            response_message = \"V časovém limitu nebyl nalezen rozvrh\. Model nebyl prokázán jako neproveditelný\.\"\n"
    r"        else:\n"
    r"            diagnostics = _fixed_conflict_diagnostics\(payload\) or \[\n"
    r"                \{\n"
    r"                    \"code\": \"INFEASIBLE_MODEL\",\n"
    r"                    \"message\": \(\"Model nemá řešení při aktuální kombinaci tvrdých omezení\.\"\),\n"
    r"                    \"entityIds\": \[\],\n"
    r"                \}\n"
    r"            \]\n"
    r"            response_code = \"INFEASIBLE\"\n"
    r"            response_message = \"Pro zadaná data neexistuje rozvrh bez tvrdého konfliktu\.\"\n"
    r"        raise HTTPException\(\n"
    r"            status_code=422,\n"
    r"            detail=\{\n"
    r"                \"code\": response_code,\n"
    r"                \"message\": response_message,\n"
    r"                \"causes\": diagnostics,\n"
    r"            \},\n"
    r"        \)\n",
    re.MULTILINE,
)

solve_replacement = '''    objective = sum(objective_terms)
    workers = _search_workers(payload)
    effective_time_limit_seconds = _solver_time_limit_seconds(
        payload,
        request_started,
    )
    feasibility_wall_time_seconds = 0.0
    optimization_wall_time_seconds = 0.0
    search_phases: list[str] = []

    if workers > 1:
        # Full-school runs are deliberately two-phase. A large weighted objective can
        # delay the very first solution on a tightly constrained school model. First
        # prove feasibility without an objective; once a valid timetable exists, use
        # it as a warm start for the remaining optimization budget.
        feasibility_solver = cp_model.CpSolver()
        feasibility_solver.parameters.max_time_in_seconds = (
            effective_time_limit_seconds
        )
        feasibility_solver.parameters.num_search_workers = workers
        feasibility_solver.parameters.random_seed = payload.random_seed
        feasibility_status = feasibility_solver.solve(model)
        feasibility_wall_time_seconds = feasibility_solver.wall_time
        search_phases.append("FEASIBILITY")

        solver = feasibility_solver
        status = feasibility_status
        if feasibility_status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            # A satisfaction model reports OPTIMAL when it finds a solution because
            # there is no objective yet. It is only a feasible seed for our real
            # weighted objective, so never expose it as an optimized timetable.
            status = cp_model.FEASIBLE
            for block in blocks:
                selected_hint = next(
                    variable
                    for _candidate, variable in variables[block.id]
                    if feasibility_solver.value(variable) == 1
                )
                model.add_hint(selected_hint, 1)

            remaining_optimization_seconds = max(
                0.0,
                effective_time_limit_seconds - feasibility_wall_time_seconds,
            )
            if remaining_optimization_seconds >= 1.0:
                model.minimize(objective)
                optimization_solver = cp_model.CpSolver()
                optimization_solver.parameters.max_time_in_seconds = (
                    remaining_optimization_seconds
                )
                optimization_solver.parameters.num_search_workers = workers
                optimization_solver.parameters.random_seed = payload.random_seed
                optimization_status = optimization_solver.solve(model)
                optimization_wall_time_seconds = optimization_solver.wall_time
                search_phases.append("OPTIMIZATION")
                if optimization_status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                    solver = optimization_solver
                    status = optimization_status
    else:
        model.minimize(objective)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = effective_time_limit_seconds
        solver.parameters.num_search_workers = workers
        solver.parameters.random_seed = payload.random_seed
        status = solver.solve(model)
        optimization_wall_time_seconds = solver.wall_time
        search_phases.append("OPTIMIZATION")

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if status == cp_model.UNKNOWN:
            diagnostics = [
                {
                    "code": "SEARCH_LIMIT_EXCEEDED",
                    "message": ("Solver v časovém limitu nenalezl kandidáta. To samo o sobě nedokazuje, že model nemá řešení."),
                    "entityIds": [],
                    "details": {
                        "requestedTimeLimitSeconds": payload.time_limit_seconds,
                        "effectiveTimeLimitSeconds": effective_time_limit_seconds,
                        "workers": workers,
                        "searchPhase": search_phases[-1] if search_phases else "UNKNOWN",
                    },
                }
            ]
            response_code = "SEARCH_LIMIT_EXCEEDED"
            response_message = "V časovém limitu nebyl nalezen rozvrh. Model nebyl prokázán jako neproveditelný."
        else:
            diagnostics = _fixed_conflict_diagnostics(payload) or [
                {
                    "code": "INFEASIBLE_MODEL",
                    "message": ("Model nemá řešení při aktuální kombinaci tvrdých omezení."),
                    "entityIds": [],
                }
            ]
            response_code = "INFEASIBLE"
            response_message = "Pro zadaná data neexistuje rozvrh bez tvrdého konfliktu."
        raise HTTPException(
            status_code=422,
            detail={
                "code": response_code,
                "message": response_message,
                "causes": diagnostics,
            },
        )
'''

main, count = solve_pattern.subn(solve_replacement, main, count=1)
if count != 1:
    raise RuntimeError(f"solver search block: expected one replacement, found {count}")

old_search_diagnostic = '''    search_diagnostic = (
        {
            "code": "PARALLEL_FULL_SCHOOL_SEARCH",
            "message": (f"Solver použil portfolio {workers} paralelních pracovníků."),
        }
        if workers > 1
        else {
            "code": "DETERMINISTIC_TEST_MODE",
            "message": "Solver použil jedno vlákno a pevný random seed.",
        }
    )
'''
new_search_diagnostic = '''    search_diagnostic = (
        {
            "code": "FEASIBILITY_FIRST_SEARCH",
            "message": (
                f"Solver použil {workers} paralelních pracovníků: nejprve našel "
                "platný rozvrh a potom využil zbývající čas k optimalizaci."
            ),
            "details": {
                "phases": search_phases,
                "feasibilityWallTimeSeconds": feasibility_wall_time_seconds,
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
main = replace_once(
    main,
    old_search_diagnostic,
    new_search_diagnostic,
    "search diagnostic",
)

main = replace_once(
    main,
    '            "wallTimeSeconds": solver.wall_time,\n',
    '            "wallTimeSeconds": feasibility_wall_time_seconds + optimization_wall_time_seconds,\n',
    "combined wall time",
)
main = replace_once(
    main,
    '            "workers": workers,\n            "requestedTimeLimitSeconds": payload.time_limit_seconds,\n',
    '            "workers": workers,\n            "searchPhases": search_phases,\n            "feasibilityWallTimeSeconds": feasibility_wall_time_seconds,\n            "optimizationWallTimeSeconds": optimization_wall_time_seconds,\n            "requestedTimeLimitSeconds": payload.time_limit_seconds,\n',
    "solver phase stats",
)
main_path.write_text(main)


generate_path = Path("apps/web/app/generate/page.tsx")
generate = generate_path.read_text()
generate = replace_once(
    generate,
    "  const [timeLimitSeconds, setTimeLimitSeconds] = useState(180);",
    "  const [timeLimitSeconds, setTimeLimitSeconds] = useState(240);",
    "generation default",
)
generate = replace_once(
    generate,
    '''            <option value={180}>3 minuty · doporučeno pro celou školu</option>
            <option value={300}>5 minut · maximum s bezpečnou rezervou</option>''',
    '''            <option value={180}>3 minuty · kratší výpočet celé školy</option>
            <option value={240}>4 minuty · doporučeno pro celou školu</option>
            <option value={300}>5 minut · maximum s bezpečnou rezervou</option>''',
    "generation options",
)
generate = replace_once(
    generate,
    '''            Delší výpočet výrazně pomáhá omezit mezery tříd a učitelů.
            Pětiminutový režim na produkci ukončí solver s rezervou před
            serverovým timeoutem, aby se nejlepší nalezený návrh stihl uložit.''',
    '''            Solver nejdřív hledá libovolný platný rozvrh a teprve potom
            využije zbývající čas ke zlepšení kvality. Pětiminutový režim na
            produkci skončí s rezervou před serverovým timeoutem, aby se nejlepší
            nalezený návrh stihl uložit.''',
    "generation help",
)
generate_path.write_text(generate)


test_path = Path("apps/solver/tests/test_solve.py")
test_text = test_path.read_text()
anchor = '''def test_three_split_groups_run_in_the_same_parallel_slot() -> None:
'''
new_test = '''def test_full_school_search_is_feasibility_first() -> None:
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
test_text = replace_once(
    test_text,
    anchor,
    new_test + anchor,
    "feasibility-first regression test",
)
test_path.write_text(test_text)
