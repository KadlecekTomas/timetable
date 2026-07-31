MORNING_PERIOD_LIMIT = 6
MIN_LUNCH_BREAK_MINUTES = 50


def crosses_lunch_break(period: int, duration: int) -> bool:
    """Return True when a lesson block would span morning and afternoon teaching."""
    return period < MORNING_PERIOD_LIMIT < period + duration


def is_afternoon_period(period: int) -> bool:
    return period >= MORNING_PERIOD_LIMIT
