from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cross_subject_rotation_swaps_groups_and_can_use_afternoon() -> None:
    assignment_prefix = "6a-rot-cj-m"
    assignments = [
        {
            "id": f"{assignment_prefix}-l1-g1",
            "teacher_id": "teacher-cj",
            "class_id": "class-6a",
            "subject_id": "subject-cj",
            "group": "GROUP_1",
            "weekly_periods": 1,
        },
        {
            "id": f"{assignment_prefix}-l1-g2",
            "teacher_id": "teacher-m",
            "class_id": "class-6a",
            "subject_id": "subject-m",
            "group": "GROUP_2",
            "weekly_periods": 1,
        },
        {
            "id": f"{assignment_prefix}-l2-g1",
            "teacher_id": "teacher-m",
            "class_id": "class-6a",
            "subject_id": "subject-m",
            "group": "GROUP_1",
            "weekly_periods": 1,
        },
        {
            "id": f"{assignment_prefix}-l2-g2",
            "teacher_id": "teacher-cj",
            "class_id": "class-6a",
            "subject_id": "subject-cj",
            "group": "GROUP_2",
            "weekly_periods": 1,
        },
    ]
    availability = [
        {
            "entity_type": "TEACHER",
            "entity_id": teacher_id,
            "day": 0,
            "period": period,
            "kind": "UNAVAILABLE",
        }
        for teacher_id in ("teacher-cj", "teacher-m")
        for period in (1, 2, 3, 4, 6)
    ]

    response = client.post(
        "/solve",
        json={
            "periods_per_day": [7],
            "subjects": [
                {"id": "subject-cj", "code": "CJ"},
                {"id": "subject-m", "code": "M"},
            ],
            "assignments": assignments,
            "availability": availability,
        },
    )

    assert response.status_code == 200, response.text
    lessons = {
        lesson["assignment_id"]: lesson for lesson in response.json()["lessons"]
    }
    assert len(lessons) == 4

    leg_1_periods = {
        lessons[f"{assignment_prefix}-l1-g1"]["period"],
        lessons[f"{assignment_prefix}-l1-g2"]["period"],
    }
    leg_2_periods = {
        lessons[f"{assignment_prefix}-l2-g1"]["period"],
        lessons[f"{assignment_prefix}-l2-g2"]["period"],
    }
    assert len(leg_1_periods) == 1
    assert len(leg_2_periods) == 1
    assert leg_1_periods != leg_2_periods
    assert leg_1_periods | leg_2_periods == {0, 5}

    assert lessons[f"{assignment_prefix}-l1-g1"]["subject_id"] == "subject-cj"
    assert lessons[f"{assignment_prefix}-l1-g2"]["subject_id"] == "subject-m"
    assert lessons[f"{assignment_prefix}-l2-g1"]["subject_id"] == "subject-m"
    assert lessons[f"{assignment_prefix}-l2-g2"]["subject_id"] == "subject-cj"
    assert lessons[f"{assignment_prefix}-l1-g1"]["teacher_id"] == "teacher-cj"
    assert lessons[f"{assignment_prefix}-l2-g2"]["teacher_id"] == "teacher-cj"
    assert lessons[f"{assignment_prefix}-l1-g2"]["teacher_id"] == "teacher-m"
    assert lessons[f"{assignment_prefix}-l2-g1"]["teacher_id"] == "teacher-m"


def test_explicit_rotation_rejects_incomplete_subject_swap() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [4],
            "assignments": [
                {
                    "id": "rotation-l1-g1",
                    "teacher_id": "teacher-cj",
                    "class_id": "class-6a",
                    "subject_id": "subject-cj",
                    "group": "GROUP_1",
                    "weekly_periods": 1,
                    "parallel_key": "rotation-l1",
                    "rotation_key": "rotation",
                    "rotation_leg": 1,
                },
                {
                    "id": "rotation-l1-g2",
                    "teacher_id": "teacher-m",
                    "class_id": "class-6a",
                    "subject_id": "subject-m",
                    "group": "GROUP_2",
                    "weekly_periods": 1,
                    "parallel_key": "rotation-l1",
                    "rotation_key": "rotation",
                    "rotation_leg": 1,
                },
                {
                    "id": "rotation-l2-g1",
                    "teacher_id": "teacher-m",
                    "class_id": "class-6a",
                    "subject_id": "subject-m",
                    "group": "GROUP_1",
                    "weekly_periods": 1,
                    "parallel_key": "rotation-l2",
                    "rotation_key": "rotation",
                    "rotation_leg": 2,
                },
                {
                    "id": "rotation-l2-g2",
                    "teacher_id": "teacher-cj",
                    "class_id": "class-6a",
                    "subject_id": "subject-m",
                    "group": "GROUP_2",
                    "weekly_periods": 1,
                    "parallel_key": "rotation-l2",
                    "rotation_key": "rotation",
                    "rotation_leg": 2,
                },
            ],
        },
    )

    assert response.status_code == 422
    assert "must swap both subjects and teachers" in response.text
