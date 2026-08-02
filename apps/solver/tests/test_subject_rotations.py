from collections import defaultdict

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def rotation_assignments(placement: str) -> list[dict[str, object]]:
    common = {
        "class_id": "class-6b",
        "weekly_periods": 1,
        "rotation_key": "rotation-6b-cj-m",
        "rotation_placement": placement,
    }
    return [
        {
            **common,
            "id": "rotation-l1-g1",
            "teacher_id": "teacher-cj",
            "subject_id": "subject-cj",
            "group": "GROUP_1",
            "parallel_key": "rotation-6b-cj-m-l1",
            "rotation_leg": 1,
        },
        {
            **common,
            "id": "rotation-l1-g2",
            "teacher_id": "teacher-m",
            "subject_id": "subject-m",
            "group": "GROUP_2",
            "parallel_key": "rotation-6b-cj-m-l1",
            "rotation_leg": 1,
        },
        {
            **common,
            "id": "rotation-l2-g1",
            "teacher_id": "teacher-m",
            "subject_id": "subject-m",
            "group": "GROUP_1",
            "parallel_key": "rotation-6b-cj-m-l2",
            "rotation_leg": 2,
        },
        {
            **common,
            "id": "rotation-l2-g2",
            "teacher_id": "teacher-cj",
            "subject_id": "subject-cj",
            "group": "GROUP_2",
            "parallel_key": "rotation-6b-cj-m-l2",
            "rotation_leg": 2,
        },
    ]


def lessons_by_id(response) -> dict[str, dict[str, object]]:
    return {
        lesson["assignment_id"]: lesson
        for lesson in response.json()["lessons"]
    }


def assert_parallel_leg(
    lessons: dict[str, dict[str, object]],
    left_id: str,
    right_id: str,
) -> tuple[int, int]:
    left = lessons[left_id]
    right = lessons[right_id]
    assert left["day"] == right["day"]
    assert left["period"] == right["period"]
    assert left["duration"] == right["duration"]
    return int(left["day"]), int(left["period"])


def test_adjacent_rotation_can_reverse_legs_and_run_in_afternoon() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [8],
            "subjects": [
                {"id": "subject-cj", "code": "CJ"},
                {"id": "subject-m", "code": "M"},
            ],
            "assignments": rotation_assignments("ADJACENT"),
            # The semantic first leg is fixed to the final period. The solver
            # must place the second leg immediately before it, proving that it
            # may reverse the chronological order of the swap.
            "fixed_lessons": [
                {
                    "assignment_id": "rotation-l1-g1",
                    "block_index": 0,
                    "day": 0,
                    "period": 7,
                }
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = lessons_by_id(response)
    leg_1 = assert_parallel_leg(
        lessons,
        "rotation-l1-g1",
        "rotation-l1-g2",
    )
    leg_2 = assert_parallel_leg(
        lessons,
        "rotation-l2-g1",
        "rotation-l2-g2",
    )
    assert leg_1 == (0, 7)
    assert leg_2 == (0, 6)
    assert lessons["rotation-l1-g1"]["subject_id"] == "subject-cj"
    assert lessons["rotation-l1-g2"]["subject_id"] == "subject-m"
    assert lessons["rotation-l2-g1"]["subject_id"] == "subject-m"
    assert lessons["rotation-l2-g2"]["subject_id"] == "subject-cj"


def test_same_day_rotation_may_use_morning_and_afternoon_due_to_collisions() -> None:
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
            "assignments": rotation_assignments("SAME_DAY"),
            "availability": availability,
        },
    )

    assert response.status_code == 200, response.text
    lessons = lessons_by_id(response)
    leg_1 = assert_parallel_leg(
        lessons,
        "rotation-l1-g1",
        "rotation-l1-g2",
    )
    leg_2 = assert_parallel_leg(
        lessons,
        "rotation-l2-g1",
        "rotation-l2-g2",
    )
    assert leg_1[0] == leg_2[0] == 0
    assert {leg_1[1], leg_2[1]} == {0, 5}


def test_flexible_rotation_can_use_different_days_when_required() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2, 2],
            "assignments": rotation_assignments("FLEXIBLE"),
            "fixed_lessons": [
                {
                    "assignment_id": "rotation-l1-g1",
                    "block_index": 0,
                    "day": 0,
                    "period": 0,
                },
                {
                    "assignment_id": "rotation-l2-g1",
                    "block_index": 0,
                    "day": 1,
                    "period": 1,
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = lessons_by_id(response)
    assert assert_parallel_leg(
        lessons,
        "rotation-l1-g1",
        "rotation-l1-g2",
    ) == (0, 0)
    assert assert_parallel_leg(
        lessons,
        "rotation-l2-g1",
        "rotation-l2-g2",
    ) == (1, 1)


def test_adjacent_rotation_rejects_nonadjacent_fixed_legs() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [4],
            "assignments": rotation_assignments("ADJACENT"),
            "fixed_lessons": [
                {
                    "assignment_id": "rotation-l1-g1",
                    "block_index": 0,
                    "day": 0,
                    "period": 0,
                },
                {
                    "assignment_id": "rotation-l2-g1",
                    "block_index": 0,
                    "day": 0,
                    "period": 3,
                },
            ],
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "ROTATION_PLACEMENT_INFEASIBLE"
    assert any(
        cause["code"] == "ROTATION_PLACEMENT_UNAVAILABLE"
        for cause in detail["causes"]
    )


def test_explicit_rotation_rejects_incomplete_subject_swap() -> None:
    assignments = rotation_assignments("SAME_DAY")
    assignments[-1] = {
        **assignments[-1],
        "subject_id": "subject-m",
    }
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [4],
            "assignments": assignments,
        },
    )

    assert response.status_code == 422
    assert "must swap both subjects and teachers" in response.text


def test_regular_and_sports_classes_keep_independent_explicit_allocations() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [8, 8],
            "classes": [
                {
                    "id": "class-6a",
                    "code": "6.A",
                    "profile": "REGULAR",
                },
                {
                    "id": "class-6b",
                    "code": "6.B",
                    "profile": "SPORTS",
                },
            ],
            "subjects": [
                {"id": "subject-m", "code": "M"},
                {"id": "subject-tv", "code": "TV"},
            ],
            "assignments": [
                {
                    "id": "6a-m",
                    "teacher_id": "teacher-6a-m",
                    "class_id": "class-6a",
                    "subject_id": "subject-m",
                    "weekly_periods": 4,
                },
                {
                    "id": "6a-tv",
                    "teacher_id": "teacher-6a-tv",
                    "class_id": "class-6a",
                    "subject_id": "subject-tv",
                    "weekly_periods": 2,
                },
                {
                    "id": "6b-m",
                    "teacher_id": "teacher-6b-m",
                    "class_id": "class-6b",
                    "subject_id": "subject-m",
                    "weekly_periods": 3,
                },
                {
                    "id": "6b-tv",
                    "teacher_id": "teacher-6b-tv",
                    "class_id": "class-6b",
                    "subject_id": "subject-tv",
                    "weekly_periods": 5,
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    totals: dict[tuple[str, str], int] = defaultdict(int)
    for lesson in response.json()["lessons"]:
        totals[(lesson["class_id"], lesson["subject_id"])] += lesson["duration"]

    assert totals == {
        ("class-6a", "subject-m"): 4,
        ("class-6a", "subject-tv"): 2,
        ("class-6b", "subject-m"): 3,
        ("class-6b", "subject-tv"): 5,
    }
