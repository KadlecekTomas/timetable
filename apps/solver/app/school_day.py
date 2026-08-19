MORNING_PERIOD_LIMIT = 6
MIN_LUNCH_BREAK_MINUTES = 50
FRIDAY_DAY_INDEX = 4
TEACHER_BREAK_PERIODS = (3, 4, 5)  # zero-based: 4th, 5th, 6th lessons
HISTORY_SUBJECT_CODE = "DEJ"


def crosses_lunch_break(period: int, duration: int) -> bool:
    """Return True when a lesson block would span morning and afternoon teaching."""
    return period < MORNING_PERIOD_LIMIT < period + duration


def is_afternoon_period(period: int) -> bool:
    return period >= MORNING_PERIOD_LIMIT


def is_forbidden_friday_lesson(day: int, period: int, duration: int) -> bool:
    """Friday teaching must finish by the end of the sixth lesson."""
    return day == FRIDAY_DAY_INDEX and period + duration > MORNING_PERIOD_LIMIT
