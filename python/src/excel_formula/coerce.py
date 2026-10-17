"""Coercion and comparisons (spec §8)."""

from __future__ import annotations

import math
import re
from typing import Any

from excel_formula.value import ExcelError, NonScalar, Scalar, err, is_error

_NUM = re.compile(r"^([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$")


def _trim(s: str) -> str:
    a, b = 0, len(s)
    while a < b and s[a] == " ":
        a += 1
    while b > a and s[b - 1] == " ":
        b -= 1
    return s[a:b]


def to_number(v: Scalar) -> float | ExcelError:
    if isinstance(v, ExcelError):
        return v
    if isinstance(v, NonScalar):
        return err("#VALUE!")
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if v is None:
        return 0.0
    s = _trim(v)
    if not _NUM.match(s):
        return err("#VALUE!")
    n = float(s)
    return n if math.isfinite(n) else err("#NUM!")


def to_text(v: Scalar) -> str | ExcelError:
    if isinstance(v, ExcelError):
        return v
    if isinstance(v, NonScalar):
        return err("#VALUE!")
    if isinstance(v, str):
        return v
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, float) and v.is_integer() and abs(v) <= 2**53:
        return str(int(v))
    if isinstance(v, int):
        return str(v)
    return str(v)


def to_boolean(v: Scalar) -> bool | ExcelError:
    if isinstance(v, ExcelError):
        return v
    if isinstance(v, NonScalar):
        return err("#VALUE!")
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if v is None:
        return False
    return err("#VALUE!")


def fold_az(s: str) -> str:
    return "".join(chr(ord(c) + 32) if "A" <= c <= "Z" else c for c in s)


def _empty_like(other: Scalar) -> Scalar:
    if isinstance(other, bool):
        return False
    if isinstance(other, (int, float)):
        return 0
    if isinstance(other, str):
        return ""
    if other is None:
        return None
    return err("#VALUE!")


def _rank(v: Scalar) -> int:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return 0
    if isinstance(v, str):
        return 1
    if isinstance(v, bool):
        return 2
    return 3


def equal(a: Scalar, b: Scalar) -> bool | ExcelError:
    if is_error(a):
        return a
    if is_error(b):
        return b
    if isinstance(a, NonScalar) or isinstance(b, NonScalar):
        return False
    if a is None and b is None:
        return True
    if a is None:
        a = _empty_like(b)
    elif b is None:
        b = _empty_like(a)
    if is_error(a):
        return a
    if is_error(b):
        return b
    if isinstance(a, str) and isinstance(b, str):
        return fold_az(a) == fold_az(b)
    if isinstance(a, bool) and isinstance(b, bool):
        return a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        return float(a) == float(b)
    return False


def compare(a: Scalar, b: Scalar) -> int | ExcelError:
    if is_error(a):
        return a
    if is_error(b):
        return b
    if isinstance(a, NonScalar) or isinstance(b, NonScalar):
        return err("#VALUE!")
    if a is None and b is None:
        return 0
    if a is None:
        a = _empty_like(b)
    elif b is None:
        b = _empty_like(a)
    if is_error(a):
        return a
    if is_error(b):
        return b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        return 0 if float(a) == float(b) else (-1 if float(a) < float(b) else 1)
    if isinstance(a, str) and isinstance(b, str):
        fa, fb = fold_az(a), fold_az(b)
        return 0 if fa == fb else (-1 if fa < fb else 1)
    if isinstance(a, bool) and isinstance(b, bool):
        return 0 if a is b else (1 if a else -1)
    return _rank(a) - _rank(b)
