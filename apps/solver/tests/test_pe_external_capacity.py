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


def base_unavailability() -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    for room_id in ["room:TV1", "room:TV2", "room:SAL"]:
        result.append(
            {
                "entity_type": "ROOM",
                "entity_id": room_id,
                "day": 0,
                "period": 0,
                "kind": "UNAVAILABLE",
            }
        )
    for room_id in ["room:HALA1", "room:HALA2"]:
        for day in [0, 1, 2, 4]:
            result.append(
                {
                    "entity_type": "ROOM",
                    "entity_id": room_id,
                    "day": day,
                    "period": 0,
                    "kind": "UNAVAILABLE",
                }
            )
    return result


def force_teacher_to_thursday(
    availability: list[dict[str, object]], teacher_id: str
) -> None:
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


def test_two_first_grade_reservations_reduce_thursday_capacity_from_five_to_three() -> None:
    availability = base_unavailability()
    for room_id in ["room:HALA1", "room:HALA2"]:
        availability.append(
            {
                "entity_type": "ROOM",
                "entity_id": room_id,
                "day": 3,
                "period": 0,
                "kind": "UNAVAILABLE",
            }
        )

    assignments: list[dict[str, object]] = []
    for index in range(4):
        teacher_id = f"teacher-{index}"
        force_teacher_to_thursday(availability, teacher_id)
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

    response = client.post(
        "/solve",
        json={
            "periods_per_day": [1, 1, 1, 1, 1],
            "subjects": [{"id": "subject:TV", "code": "TV"}],
            "rooms": sport_rooms(),
            "availability": availability,
            "assignments": assignments,
        },
    )

    assert response.status_code == 422, response.text
