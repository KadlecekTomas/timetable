from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def payload(shared: bool) -> dict:
    return {
        "periods_per_day": [2],
        "classes": [
            {"id": "class-8b", "code": "8.B", "profile": "SPORTS"},
            {"id": "class-9b", "code": "9.B", "profile": "SPORTS"},
        ],
        "subjects": [{"id": "tv", "code": "TV"}],
        "rooms": [{"id": "gym", "room_type_id": "gym"}],
        "assignments": [
            {
                "id": "tv-8b",
                "teacher_id": "teacher-8b",
                "class_id": "class-8b",
                "subject_id": "tv",
                "group": "GROUP_1",
                "weekly_periods": 2,
                "lesson_shape": "DOUBLE",
                "double_periods_count": 1,
                "required_room_type_id": "gym",
                "room_share_key": "shared-tv" if shared else None,
            },
            {
                "id": "tv-9b",
                "teacher_id": "teacher-9b",
                "class_id": "class-9b",
                "subject_id": "tv",
                "group": "GROUP_1",
                "weekly_periods": 2,
                "lesson_shape": "DOUBLE",
                "double_periods_count": 1,
                "required_room_type_id": "gym",
                "room_share_key": "shared-tv" if shared else None,
            },
        ],
        "time_limit_seconds": 5,
    }


def test_declared_co_teachers_share_the_same_room_and_time() -> None:
    response = client.post("/solve", json=payload(True))
    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    assert len(lessons) == 2
    assert {(lesson["day"], lesson["period"], lesson["room_id"]) for lesson in lessons} == {
        (0, 0, "gym")
    }
    assert response.json()["score"]["valid"] is True


def test_same_single_room_is_infeasible_without_room_share() -> None:
    response = client.post("/solve", json=payload(False))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "INFEASIBLE"
