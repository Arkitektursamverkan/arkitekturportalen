"""Skydd mot formelinjektion i CSV-filer som laddas ner.

Ett kalkylprogram läser en cell som börjar med = + - @ (eller tab/CR, som
somliga program hoppar över) som en formel. Text som någon annan skrivit in –
ett objektnamn, ett enkätsvar – kan då köra en formel hos den som öppnar
exporten. Sådana celler får en apostrof först; kalkylprogrammen visar den inte
utan visar texten som text. Tal (int/float) skrivs som de är, så att -3 förblir
ett tal.

Importen tar bort apostrofen igen (`unescape_cell`), så att en export kan
läsas in oförändrad.
"""
from __future__ import annotations

import csv
from collections.abc import Iterable
from typing import Any

FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: Any) -> Any:
    """Värdet för en CSV-cell, med en apostrof först om det ser ut som en formel."""
    if value is None or isinstance(value, int | float):  # bool är en int
        return value
    text = str(value)
    if text.startswith(FORMULA_PREFIXES):
        return "'" + text
    return text


def unescape_cell(value: str) -> str:
    """Omvändningen vid import: tar bort en apostrof som safe_cell satt dit."""
    if len(value) > 1 and value[0] == "'" and value[1:].startswith(FORMULA_PREFIXES):
        return value[1:]
    return value


class SafeWriter:
    """csv.writer som skyddar varje cell med safe_cell."""

    def __init__(self, f: Any, **kwargs: Any) -> None:
        self._writer = csv.writer(f, **kwargs)

    def writerow(self, row: Iterable[Any]) -> Any:
        return self._writer.writerow([safe_cell(v) for v in row])

    def writerows(self, rows: Iterable[Iterable[Any]]) -> None:
        for row in rows:
            self.writerow(row)


def safe_writer(f: Any, **kwargs: Any) -> SafeWriter:
    return SafeWriter(f, **kwargs)
