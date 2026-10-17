"""Run spec/fixtures/tier0 and tier1. No pytest required."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python" / "src"))

from excel_formula import EvaluationError, Evaluator  # noqa: E402


def same(actual: object, expected: object, tol: float) -> bool:
    if isinstance(expected, bool) or isinstance(actual, bool):
        return actual == expected
    if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        return abs(float(actual) - float(expected)) <= tol
    return actual == expected


def main() -> int:
    fails = 0
    for folder in ("tier0", "tier1"):
        for path in sorted((ROOT / "spec" / "fixtures" / folder).glob("*.json")):
            fx = json.loads(path.read_text())
            if fx.get("skip"):
                continue
            ev = Evaluator(strict=bool((fx.get("options") or {}).get("strict", False)))
            expected = fx["expected"]
            tol = float(fx.get("tolerance", 1e-9))
            try:
                if fx.get("mode") == "aggregate":
                    actual = ev.aggregate(fx["formula"], fx.get("rows") or [], fx.get("context") or {})
                else:
                    actual = ev.evaluate(fx["formula"], fx["context"])
            except EvaluationError as exc:
                if isinstance(expected, dict) and expected.get("$type") == "host" and exc.kind == expected.get("kind"):
                    continue
                print(f"FAIL {fx['id']}: threw {exc.kind}: {exc}")
                fails += 1
                continue
            if isinstance(expected, dict) and expected.get("$type") == "host":
                print(f"FAIL {fx['id']}: returned {actual!r}")
                fails += 1
                continue
            if not same(actual, expected, tol):
                print(f"FAIL {fx['id']}: {actual!r} != {expected!r}")
                fails += 1
    print("ok" if fails == 0 else f"{fails} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
