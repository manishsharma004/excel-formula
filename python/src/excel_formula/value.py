"""Runtime values (spec §7)."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Union


@dataclass(frozen=True)
class ExcelError:
    code: str


@dataclass(frozen=True)
class NonScalar:
    label: str = "non-scalar"


@dataclass(frozen=True)
class RecordValue(NonScalar):
    fields: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ListValue(NonScalar):
    items: tuple[Any, ...] = ()


Scalar = Union[float, int, str, bool, None, ExcelError, NonScalar]


def err(code: str) -> ExcelError:
    return ExcelError(code)


def is_error(v: Any) -> bool:
    return isinstance(v, ExcelError)


def decode_json(value: Any) -> Scalar:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            return err("#NUM!")
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        kind = value.get("$type")
        if kind == "error" and isinstance(value.get("code"), str):
            return err(value["code"])
        if kind == "number" and isinstance(value.get("value"), str):
            try:
                return float(value["value"])
            except ValueError:
                return err("#NUM!")
        return RecordValue(fields={k: decode_json(v) for k, v in value.items()})
    if isinstance(value, list):
        return ListValue(items=tuple(decode_json(v) for v in value))
    return NonScalar()


def encode_json(value: Scalar) -> Any:
    if isinstance(value, ExcelError):
        return {"$type": "error", "code": value.code}
    if isinstance(value, NonScalar):
        return {"$type": "error", "code": "#VALUE!"}
    if isinstance(value, float) and value.is_integer() and abs(value) <= 2**53:
        return int(value)
    return value
