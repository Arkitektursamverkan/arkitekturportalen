"""When a calendar event falls: recurrence rules and Swedish working days.

A recurring event stores only its rule and its first date; everything the
rule needs is read off that date (the weekday for a weekly event, the day of
the month for a monthly one …), the way Outlook does it. The dates themselves
are worked out on demand for the period asked for.

"Vardag" follows lagen (1930:173) om beräkning av lagstadgad tid: Monday to
Friday, except public holidays and midsommarafton, julafton and nyårsafton.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from functools import lru_cache

RECURRENCES: tuple[str, ...] = (
    "once",
    "weekly",
    "monthly_day",             # same day of the month as the first date
    "monthly_nth_weekday",     # e.g. the second Tuesday, as the first date is
    "monthly_first_workday",
    "monthly_last_workday",
    "yearly",
)


def _easter_sunday(year: int) -> date:
    """Gregorian Easter (anonymous/Meeus algorithm)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    weekday = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * weekday) // 451
    month, day = divmod(h + weekday - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _first_on_or_after(d: date, weekday: int) -> date:
    return d + timedelta(days=(weekday - d.weekday()) % 7)


@lru_cache(maxsize=64)
def swedish_non_working_days(year: int) -> frozenset[date]:
    """Public holidays plus the three eves that count as holidays."""
    easter = _easter_sunday(year)
    midsummer_day = _first_on_or_after(date(year, 6, 20), calendar.SATURDAY)
    return frozenset({
        date(year, 1, 1),                    # nyårsdagen
        date(year, 1, 6),                    # trettondedag jul
        easter - timedelta(days=2),          # långfredagen
        easter,                              # påskdagen
        easter + timedelta(days=1),          # annandag påsk
        date(year, 5, 1),                    # första maj
        easter + timedelta(days=39),         # Kristi himmelsfärdsdag
        easter + timedelta(days=49),         # pingstdagen
        date(year, 6, 6),                    # nationaldagen
        midsummer_day - timedelta(days=1),   # midsommarafton
        midsummer_day,                       # midsommardagen
        _first_on_or_after(date(year, 10, 31), calendar.SATURDAY),  # alla helgons dag
        date(year, 12, 24),                  # julafton
        date(year, 12, 25),                  # juldagen
        date(year, 12, 26),                  # annandag jul
        date(year, 12, 31),                  # nyårsafton
    })


def is_workday(d: date) -> bool:
    return d.weekday() < 5 and d not in swedish_non_working_days(d.year)


def _month_last_day(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _in_month(recurrence: str, anchor: date, year: int, month: int) -> date | None:
    """The date a monthly rule lands on in the given month."""
    last = _month_last_day(year, month)
    if recurrence == "monthly_day":
        # The 31st falls on the last day of shorter months.
        return date(year, month, min(anchor.day, last))
    if recurrence == "monthly_first_workday":
        d = date(year, month, 1)
        while not is_workday(d):
            d += timedelta(days=1)
        return d
    if recurrence == "monthly_last_workday":
        d = date(year, month, last)
        while not is_workday(d):
            d -= timedelta(days=1)
        return d
    if recurrence == "monthly_nth_weekday":
        nth = (anchor.day - 1) // 7  # 0 = first … 4 = fifth, read as "last"
        first = _first_on_or_after(date(year, month, 1), anchor.weekday())
        d = first + timedelta(weeks=nth)
        while d.month != month:
            d -= timedelta(weeks=1)
        return d
    return None


def occurrences(
    recurrence: str,
    start: date,
    until: date | None,
    range_from: date,
    range_to: date,
) -> list[date]:
    """Every date the event falls on within [range_from, range_to].

    `start` is the first date (and the anchor the rule reads its weekday or
    day of month from); `until` is the last date the event may fall on.
    """
    lo = max(start, range_from)
    hi = min(until, range_to) if until else range_to
    if lo > hi:
        return []

    if recurrence == "once":
        return [start] if lo <= start <= hi else []

    if recurrence == "weekly":
        d = _first_on_or_after(lo, start.weekday())
        out = []
        while d <= hi:
            out.append(d)
            d += timedelta(weeks=1)
        return out

    if recurrence == "yearly":
        out = []
        for year in range(lo.year, hi.year + 1):
            # 29 February falls on the 28th in other years.
            d = date(year, start.month, min(start.day, _month_last_day(year, start.month)))
            if lo <= d <= hi:
                out.append(d)
        return out

    out = []
    year, month = lo.year, lo.month
    while (year, month) <= (hi.year, hi.month):
        hit = _in_month(recurrence, start, year, month)
        if hit is not None and lo <= hit <= hi:
            out.append(hit)
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return out
