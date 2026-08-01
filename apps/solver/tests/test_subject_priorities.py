from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_afternoon_friendly_subject_is_placed_after_mathematics() -> None:
    subjects = [
        {"id": "subject-m", "code": "M"},
        {"id": "subject-tv", "code": "TV"},
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
            "id": "physical-education",
            "teacher_id": "teacher-tv",
            "class_id": "class-1",
            "subject_id": "subject-tv",
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
    lessons = {
        lesson["assignment_id"]: lesson for lesson in response.json()["lessons"]
    }
    assert lessons["physical-education"]["period"] == 5
    assert lessons["math"]["period"] < lessons["physical-education"]["period"]
    assert any(
        item["code"] == "PEDAGOGICAL_AFTERNOON_PRIORITY"
        for item in response.json()["diagnostics"]
    )
