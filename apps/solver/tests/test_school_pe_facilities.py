from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def sport_rooms() -> list[dict[str, str]]:
    return [
        {"id": "room:TV1", "room_type_id": "room-type:TV"},
        {"id": "room:TV2", "room_type_id": "room-type:TV"},
        {"id": "room:SAL", "room_type_id": "room-type:TV"},
        {"id": "room:HALA1", "room_type_id": "room-type:TV"},
        {"id": "room:HALA2", "room_type_id": "room-type:TV"},
    ]


def room_unavailability(periods_per_day: list[int]) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for room_id in ["room:TV1", "room:TV2", "room:SAL"]:
        for period in range(periods_per_day[0]):
            result.append(
                {
                    "entity_type": "ROOM",
                    "entity_id": room_id,
                    "day": 0,
                    "period": period,
                    "kind": "UNAVAILABLE",
                }
            )
    for room_id in ["room:HALA1", "room:HALA2"]:
        for day in [0, 1, 2, 4]:
            for period in range(periods_per_day[day]):
                result.append(
                    {
                        "entity_type": "ROOM",
                        "entity_id": room_id,
                        "day": day,
                        "period": period,
                        "kind": "UNAVAILABLE",
                    }
                )
    return result


def test_pe_assignment_cannot_use_monday() -> None:
    periods_per_day = [2, 2, 2, 2, 2]
    response = client.post(
        "/solve",
        json={
            "periods_per_day": periods_per_day,
            "subjects": [{"id": "subject:TV", "code": "TV"}],
            "rooms": sport_rooms(),
            "availability": room_unavailability(periods_per_day),
            "assignments": [
                {
                    "id": "tv-7a",
                    "teacher_id": "teacher-tv",
                    "class_id": "7a",
                    "subject_id": "subject:TV",
                    "weekly_periods": 2,
                    "lesson_shape": "DOUBLE",
                    "required_room_type_id": "room-type:TV",
                }
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    assert len(lessons) == 1
    assert lessons[0]["day"] != 0
    assert lessons[0]["room_id"] in {
        "room:TV1",
        "room:TV2",
        "room:SAL",
        "room:HALA1",
        "room:HALA2",
    }


def test_thursday_hall_adds_two_parallel_pe_capacity_slots() -> None:
    periods_per_day = [1, 1, 1, 1, 1]
    availability = room_unavailability(periods_per_day)
    assignments: list[dict[str, object]] = []

    for index in range(4):
        teacher_id = f"teacher-{index}"
        assignments.append(
            {
                "id": f"tv-{index}",
                "teacher_id": teacher_id,
                "class_id": f"class-{index}",
                "subject_id": "subject:TV",
                "weekly_periods": 1,
                "required_room_type_id": "room-type:TV",
            }
        )
        for day in [1, 2, 4]:
            availability.append(
                {
                    "entity_type": "TEACHER",
                    "entity_id": teacher_id,
                    "day": day,
                    "period": 0,
                    "kind": "UNAVAILABLE",
                }
            )

    response = client.post(
        "/solve",
        json={
            "periods_per_day": periods_per_day,
            "subjects": [{"id": "subject:TV", "code": "TV"}],
            "rooms": sport_rooms(),
            "availability": availability,
            "assignments": assignments,
        },
    )

    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    assert len(lessons) == 4
    assert {lesson["day"] for lesson in lessons} == {3}
    room_ids = [lesson["room_id"] for lesson in lessons]
    assert len(set(room_ids)) == 4
    assert any(room_id in {"room:HALA1", "room:HALA2"} for room_id in room_ids)
