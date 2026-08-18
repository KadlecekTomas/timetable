from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


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

    # 34 hours + no Mon/Fri afternoon + no consecutive afternoons has one ideal shape.
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
