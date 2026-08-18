import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def solve_ordered_day(target_code: str) -> dict[str, dict]:
    subjects = [
        {"id": "subject-m", "code": "M"},
        {"id": "subject-target", "code": target_code},
        *[
            {"id": f"subject-filler-{index}", "code": f"X{index}"}
            for index in range(1, 5)
        ],
    ]
    assignments = [
        {
            "id": "math",
            "teacher_id": "teacher-m",
            "class_id": "class-1",
            "subject_id": "subject-m",
            "weekly_periods": 1,
        },
        {
            "id": "target",
            "teacher_id": "teacher-target",
            "class_id": "class-1",
            "subject_id": "subject-target",
            "weekly_periods": 1,
        },
        *[
            {
                "id": f"filler-{index}",
                "teacher_id": f"teacher-filler-{index}",
                "class_id": "class-1",
                "subject_id": f"subject-filler-{index}",
                "weekly_periods": 1,
            }
            for index in range(1, 5)
        ],
    ]

    response = client.post(
        "/solve",
        json={
            "periods_per_day": [6],
            "subjects": subjects,
            "assignments": assignments,
        },
    )

    assert response.status_code == 200, response.text
    assert any(
        item["code"] == "PEDAGOGICAL_AFTERNOON_PRIORITY"
        for item in response.json()["diagnostics"]
    )
    return {
        lesson["assignment_id"]: lesson for lesson in response.json()["lessons"]
    }


@pytest.mark.parametrize("subject_code", ["TV", "PC", "VV", "SVS", "VZ"])
def test_primary_afternoon_subjects_are_pushed_to_the_end(subject_code: str) -> None:
    lessons = solve_ordered_day(subject_code)
    assert lessons["target"]["period"] == 5
    assert lessons["math"]["period"] < lessons["target"]["period"]


@pytest.mark.parametrize("subject_code", ["HV", "PRPK", "PKCJ"])
def test_fallback_afternoon_subjects_are_late_when_capacity_allows(
    subject_code: str,
) -> None:
    lessons = solve_ordered_day(subject_code)
    assert lessons["target"]["period"] == 5
    assert lessons["math"]["period"] < lessons["target"]["period"]


def test_primary_afternoon_subject_wins_over_fallback_subject() -> None:
    subjects = [
        {"id": "subject-m", "code": "M"},
        {"id": "subject-tv", "code": "TV"},
        {"id": "subject-hv", "code": "HV"},
        *[
            {"id": f"subject-filler-{index}", "code": f"X{index}"}
            for index in range(1, 5)
        ],
    ]
    assignments = [
        {
            "id": "math",
            "teacher_id": "teacher-m",
            "class_id": "class-1",
            "subject_id": "subject-m",
            "weekly_periods": 1,
        },
        {
            "id": "primary",
            "teacher_id": "teacher-tv",
            "class_id": "class-1",
            "subject_id": "subject-tv",
            "weekly_periods": 1,
        },
        {
            "id": "fallback",
            "teacher_id": "teacher-hv",
            "class_id": "class-1",
            "subject_id": "subject-hv",
            "weekly_periods": 1,
        },
        *[
            {
                "id": f"filler-{index}",
                "teacher_id": f"teacher-filler-{index}",
                "class_id": "class-1",
                "subject_id": f"subject-filler-{index}",
                "weekly_periods": 1,
            }
            for index in range(1, 5)
        ],
    ]

    response = client.post(
        "/solve",
        json={
            "periods_per_day": [7],
            "subjects": subjects,
            "assignments": assignments,
        },
    )

    assert response.status_code == 200, response.text
    lessons = {
        lesson["assignment_id"]: lesson for lesson in response.json()["lessons"]
    }
    assert lessons["primary"]["period"] == 6
    assert lessons["fallback"]["period"] == 5
    assert lessons["math"]["period"] < lessons["fallback"]["period"]
