from fastapi.testclient import TestClient

from app.runtime import app

client = TestClient(app)


def test_runtime_explains_class_day_policy_instead_of_generic_infeasible() -> None:
    # The school policy allows at most 34 periods for one class in a five-day
    # 8-period week (Mon/Fri afternoons are blocked and afternoons cannot be
    # consecutive). The raw solver can only report a generic infeasible model;
    # the runtime wrapper proves that relaxing this policy restores feasibility.
    assignments = [
        {
            "id": f"lesson-{index}",
            "teacher_id": f"teacher-{index}",
            "class_id": "8a",
            "subject_id": f"subject-{index}",
            "weekly_periods": 1,
        }
        for index in range(35)
    ]

    response = client.post(
        "/solve",
        json={
            "periods_per_day": [8, 8, 8, 8, 8],
            "classes": [{"id": "8a", "code": "8.A"}],
            "assignments": assignments,
            "time_limit_seconds": 5,
        },
    )

    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "INFEASIBLE"
    assert "denní struktury tříd" in error["message"]
    causes = error["details"]["causes"]
    assert causes[0]["code"] == "CLASS_DAY_POLICY_CONFLICT"


def test_runtime_preserves_specific_preflight_message() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [1],
            "assignments": [
                {
                    "id": "blocked",
                    "teacher_id": "teacher-a",
                    "class_id": "class-a",
                    "subject_id": "subject-a",
                    "weekly_periods": 1,
                }
            ],
            "availability": [
                {
                    "entity_type": "TEACHER",
                    "entity_id": "teacher-a",
                    "day": 0,
                    "period": 0,
                    "kind": "UNAVAILABLE",
                }
            ],
        },
    )

    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "INFEASIBLE_INPUT"
    assert "nemají žádné povolené umístění" in error["message"]
    assert error["details"]["causes"][0]["code"] == "EMPTY_CANDIDATE_SET"
