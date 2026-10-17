"""Evaluator (spec §6–§13, Tier 0 and Tier 1)."""

from __future__ import annotations

import math
import re
import time
from typing import Any, Callable

from excel_formula.coerce import compare, equal, to_boolean, to_number, to_text
from excel_formula.host import host
from excel_formula.value import ExcelError, ListValue, NonScalar, RecordValue, Scalar, err, is_error

XFD = 16384
MAX_ROW = 1048576
_EXP = re.compile(r"^(\d)\.(\d+)e([+-]?\d+)$", re.I)


class RangeValue:
    def __init__(self, values: list[Scalar]) -> None:
        self.values = values


def _col_letters(n: int) -> str:
    s = ""
    while n > 0:
        n, m = divmod(n - 1, 26)
        s = chr(65 + m) + s
    return s


def _finite(n: float) -> Scalar:
    return n if math.isfinite(n) else err("#NUM!")


def _round_sig(n: float, places: int, mode: str) -> float:
    if n == 0 or not math.isfinite(n):
        return n
    neg = n < 0
    m = _EXP.match(format(abs(n), ".14e"))
    if not m:
        return n
    digits = [int(c) for c in m.group(1) + m.group(2)]
    exp = int(m.group(3))
    cut = exp + places
    if cut < -1:
        return 0.0
    rest = digits[max(cut + 1, 0) :]
    nxt = digits[cut + 1] if 0 <= cut + 1 < len(digits) else 0
    bump = False if mode == "down" else (any(rest) if mode == "up" else nxt >= 5)
    if cut >= len(digits) - 1 and not bump:
        return n
    kept = digits[: max(cut + 1, 0)]
    lead = exp
    if bump:
        if cut < 0:
            return (-1 if neg else 1) * 10 ** (exp + 1)
        i = len(kept) - 1
        kept[i] += 1
        while kept[i] >= 10:
            kept[i] = 0
            i -= 1
            if i < 0:
                kept.insert(0, 1)
                lead = exp + 1
                break
            kept[i] += 1
    return _from_digits(kept, lead, neg)


def _from_digits(digits: list[int], exp: int, neg: bool) -> float:
    int_len = exp + 1
    raw = "".join(str(d) for d in digits)
    if int_len <= 0:
        body = "0." + ("0" * -int_len) + raw
    elif int_len >= len(digits):
        body = raw + ("0" * (int_len - len(digits)))
    else:
        body = raw[:int_len] + "." + raw[int_len:]
    body = re.sub(r"(\.\d*?)0+$", r"\1", body).rstrip(".")
    v = float(body)
    return -v if neg else v


def interpret(
    ast: dict,
    ctx: dict[str, Scalar],
    strict: bool,
    max_range_cells: int,
    timeout_ms: float | None,
    started: float,
    scopes: list[dict[str, Scalar]] | None = None,
    row_table: list[dict[str, Scalar]] | None = None,
) -> Scalar:
    scopes = scopes or []
    def check() -> None:
        if timeout_ms is not None and (time.perf_counter() - started) * 1000 > timeout_ms:
            host("timeout", "Evaluation timed out")

    def lookup_exact(name: str):
        for scope in reversed(scopes):
            if name in scope:
                return True, scope[name]
        if name in ctx:
            return True, ctx[name]
        return False, None

    def step(cur: Scalar, part: str) -> Scalar:
        if is_error(cur) or cur is None:
            return cur
        if isinstance(cur, RecordValue):
            if part not in cur.fields:
                return err("#REF!") if strict else None
            return cur.fields[part]
        if isinstance(cur, ListValue):
            out: list[Scalar] = []
            for item in cur.items:
                nxt = step(item, part)
                if isinstance(nxt, ListValue):
                    out.extend(nxt.items)
                else:
                    out.append(nxt)
            return ListValue(items=tuple(out))
        return err("#VALUE!")

    def lookup_name(name: str) -> Scalar:
        found, value = lookup_exact(name)
        if found:
            return value
        parts = name.split(".")
        if len(parts) < 2:
            return err("#REF!") if strict else None
        found, value = lookup_exact(parts[0])
        if not found:
            return err("#REF!") if strict else None
        for part in parts[1:]:
            value = step(value, part)
        return value

    def scalar(v: Any) -> Scalar:
        return v

    def map_list(items: tuple, fn) -> ListValue:
        if len(items) > max_range_cells:
            host("limit", "List is too large")
        return ListValue(items=tuple(fn(item) for item in items))

    def apply_unary(op: str, x: Scalar) -> Scalar:
        if isinstance(x, ListValue):
            return map_list(x.items, lambda item: apply_unary(op, item))
        n = to_number(x)
        if is_error(n):
            return n
        return _finite(-n if op == "-" else n)

    def apply_pct(x: Scalar) -> Scalar:
        if isinstance(x, ListValue):
            return map_list(x.items, apply_pct)
        n = to_number(x)
        if is_error(n):
            return n
        return _finite(n * 0.01)

    def eval_any(node: dict) -> Any:
        check()
        k = node["k"]
        if k in ("num", "str", "bool"):
            return node["v"]
        if k == "name":
            return lookup_name(node["v"])
        if k == "unary":
            return apply_unary(node["op"], eval_any(node["x"]))
        if k == "pct":
            return apply_pct(eval_any(node["x"]))
        if k == "bin":
            return pair(node["op"], eval_any(node["l"]), eval_any(node["r"]))
        if k == "call":
            return eval_call(node["name"], node["args"])
        return err("#VALUE!")

    def apply_scalar(op: str, L: Scalar, R: Scalar) -> Scalar:
        if op == "&":
            a, b = to_text(L), None
            if is_error(a):
                return a
            b = to_text(R)
            return b if is_error(b) else a + b
        if op in ("=", "<>"):
            e = equal(L, R)
            if is_error(e):
                return e
            return e if op == "=" else (not e)
        if op in ("<", ">", "<=", ">="):
            c = compare(L, R)
            if isinstance(c, ExcelError):
                return c
            return { "<": c < 0, ">": c > 0, "<=": c <= 0, ">=": c >= 0 }[op]
        a = to_number(L)
        if is_error(a):
            return a
        b = to_number(R)
        if is_error(b):
            return b
        if op == "+":
            return _finite(a + b)
        if op == "-":
            return _finite(a - b)
        if op == "*":
            return _finite(a * b)
        if op == "/":
            return err("#DIV/0!") if b == 0 else _finite(a / b)
        if op == "^":
            if a == 0 and b == 0:
                return err("#NUM!")
            if a == 0 and b < 0:
                return err("#DIV/0!")
            if a < 0 and not float(b).is_integer():
                return err("#NUM!")
            return _finite(a**b)
        return err("#VALUE!")

    def pair(op: str, L: Scalar, R: Scalar) -> Scalar:
        if is_error(L):
            return L
        if is_error(R):
            return R
        ls = L.items if isinstance(L, ListValue) else None
        rs = R.items if isinstance(R, ListValue) else None
        if ls is None and rs is None:
            return apply_scalar(op, L, R)
        n = len(ls) if ls is not None else len(rs)
        if ls is not None and rs is not None and len(ls) != len(rs):
            return err("#VALUE!")
        if n > max_range_cells:
            host("limit", "List is too large")
        out = [pair(op, ls[i] if ls is not None else L, rs[i] if rs is not None else R) for i in range(n)]
        return ListValue(items=tuple(out))

    def eval_bin(op: str, l: dict, r: dict) -> Scalar:
        return pair(op, eval_any(l), eval_any(r))

    def eval_arg(node: dict) -> dict:
        return {"kind": "scalar", "value": scalar(eval_any(node))}

    def arity(args: list, lo: int, hi: int) -> ExcelError | None:
        return err("#VALUE!") if not lo <= len(args) <= hi else None

    def widen(a: dict) -> dict:
        if a["kind"] == "scalar" and isinstance(a["value"], ListValue):
            return {"kind": "range", "values": list(a["value"].items)}
        return a

    def logic(args: list, all_: bool) -> Scalar:
        if not args:
            return err("#VALUE!")
        seen = 0
        ok = all_
        for arg in args:
            a = widen(eval_arg(arg))
            if a["kind"] == "scalar":
                if is_error(a["value"]):
                    return a["value"]
                b = to_boolean(a["value"])
                if is_error(b):
                    return b
                seen += 1
                ok = (ok and b) if all_ else (ok or b)
            else:
                for v in a["values"]:
                    if is_error(v):
                        return v
                    if isinstance(v, NonScalar):
                        return err("#VALUE!")
                    if v is None:
                        continue
                    if isinstance(v, str):
                        n = to_number(v)
                        if is_error(n):
                            continue
                        seen += 1
                        b = n != 0
                        ok = (ok and b) if all_ else (ok or b)
                        continue
                    if isinstance(v, (int, float, bool)):
                        b = to_boolean(v)
                        if is_error(b):
                            return b
                        seen += 1
                        ok = (ok and b) if all_ else (ok or b)
        return err("#VALUE!") if seen == 0 else ok

    def column_of(arg: dict) -> dict | ExcelError:
        if row_table is not None:
            peeked = widen(eval_arg(arg))
            if peeked["kind"] == "range":
                return {"direct": False, "values": peeked["values"]}
            if isinstance(peeked["value"], ListValue):
                return {"direct": False, "values": list(peeked["value"].items)}
            values: list[Scalar] = []
            for row in row_table:
                value = interpret(arg, ctx, strict, max_range_cells, timeout_ms, started, [*scopes, row], None)
                values.append(value)
            return {"direct": False, "values": values}
        a = widen(eval_arg(arg))
        if a["kind"] == "scalar":
            return {"direct": True, "values": [a["value"]]}
        return {"direct": False, "values": a["values"]}

    def agg(args: list, kind: str) -> Scalar:
        if not args:
            return err("#VALUE!")
        total = 0.0
        squares = 0.0
        prod = 1.0
        n = 0
        lo, hi = math.inf, -math.inf

        def take(num: float) -> None:
            nonlocal total, squares, prod, n, lo, hi
            total += num
            squares += num * num
            prod *= num
            n += 1
            lo, hi = min(lo, num), max(hi, num)

        for arg in args:
            a = column_of(arg)
            if isinstance(a, ExcelError):
                return a
            if a["direct"]:
                value = a["values"][0]
                if value is None:
                    continue
                if is_error(value):
                    return value
                num = to_number(value)
                if is_error(num):
                    return num
                take(float(num))
            else:
                for v in a["values"]:
                    if is_error(v):
                        return v
                    if v is None or isinstance(v, (bool, str)):
                        continue
                    if isinstance(v, NonScalar):
                        return err("#VALUE!")
                    take(float(v))
        if kind == "sum":
            return _finite(total)
        if kind == "product":
            return 0 if n == 0 else _finite(prod)
        if n == 0:
            return err("#DIV/0!") if kind == "average" else 0
        if kind == "average":
            return _finite(total / n)
        return lo if kind == "min" else hi

    def count(args: list, counta: bool) -> Scalar:
        if not args:
            return err("#VALUE!")
        n = 0
        for arg in args:
            a = column_of(arg)
            if isinstance(a, ExcelError):
                return a
            items = a["values"]
            direct = a["direct"]
            for v in items:
                if counta:
                    if v is not None:
                        n += 1
                    continue
                if is_error(v) or v is None or isinstance(v, NonScalar):
                    continue
                if direct:
                    if isinstance(v, (int, float, bool)) or (isinstance(v, str) and not is_error(to_number(v))):
                        n += 1
                elif isinstance(v, (int, float)) and not isinstance(v, bool):
                    n += 1
        return n

    def side(args: list, direction: str) -> Scalar:
        bad = arity(args, 1, 2)
        if bad:
            return bad
        s = to_text(scalar(eval_any(args[0])))
        if is_error(s):
            return s
        n = 1
        if len(args) == 2:
            c = to_number(scalar(eval_any(args[1])))
            if is_error(c):
                return c
            n = math.trunc(c)
        if n < 0:
            return err("#VALUE!")
        if direction == "left":
            return s[:n]
        return s[len(s) - n :] if n else ""

    def concat(args: list) -> Scalar:
        if not args:
            return err("#VALUE!")
        out = ""
        for arg in args:
            a = widen(eval_arg(arg))
            items = a["values"] if a["kind"] == "range" else [a["value"]]
            for v in items:
                s = to_text(v)
                if is_error(s):
                    return s
                out += s
        return out

    def round_fn(args: list, mode: str) -> Scalar:
        bad = arity(args, 2, 2)
        if bad:
            return bad
        n = to_number(scalar(eval_any(args[0])))
        if is_error(n):
            return n
        d = to_number(scalar(eval_any(args[1])))
        if is_error(d):
            return d
        return _round_sig(float(n), math.trunc(d), mode)

    def fn_if(args: list) -> Scalar:
        bad = arity(args, 2, 3)
        if bad:
            return bad
        c = to_boolean(scalar(eval_any(args[0])))
        if is_error(c):
            return c
        if c:
            return scalar(eval_any(args[1]))
        if len(args) == 2:
            return False
        return scalar(eval_any(args[2]))

    funcs: dict[str, Callable[[list], Scalar]] = {
        "if": fn_if,
        "and": lambda a: logic(a, True),
        "or": lambda a: logic(a, False),
        "not": lambda a: _not(a),
        "sum": lambda a: agg(a, "sum"),
        "product": lambda a: agg(a, "product"),
        "average": lambda a: agg(a, "average"),
        "min": lambda a: agg(a, "min"),
        "max": lambda a: agg(a, "max"),
        "count": lambda a: count(a, False),
        "counta": lambda a: count(a, True),
        "iferror": lambda a: _iferror(a),
        "ifna": lambda a: _ifna(a),
        "len": lambda a: _len(a),
        "left": lambda a: side(a, "left"),
        "right": lambda a: side(a, "right"),
        "mid": lambda a: _mid(a),
        "concat": concat,
        "concatenate": concat,
        "round": lambda a: round_fn(a, "half"),
        "roundup": lambda a: round_fn(a, "up"),
        "rounddown": lambda a: round_fn(a, "down"),
        "int": lambda a: _int(a),
        "trunc": lambda a: _trunc(a),
    }

    def _not(args: list) -> Scalar:
        bad = arity(args, 1, 1)
        if bad:
            return bad
        a = eval_arg(args[0])
        if a["kind"] == "range":
            return err("#VALUE!")
        b = to_boolean(a["value"])
        return b if is_error(b) else (not b)

    def _iferror(args: list) -> Scalar:
        bad = arity(args, 2, 2)
        if bad:
            return bad
        v = scalar(eval_any(args[0]))
        return scalar(eval_any(args[1])) if is_error(v) else v

    def _ifna(args: list) -> Scalar:
        bad = arity(args, 2, 2)
        if bad:
            return bad
        v = scalar(eval_any(args[0]))
        if isinstance(v, ExcelError) and v.code == "#N/A":
            return scalar(eval_any(args[1]))
        return v

    def _len(args: list) -> Scalar:
        bad = arity(args, 1, 1)
        if bad:
            return bad
        s = to_text(scalar(eval_any(args[0])))
        if is_error(s):
            return s
        return len(s.encode("utf-16-le")) // 2

    def _mid(args: list) -> Scalar:
        bad = arity(args, 3, 3)
        if bad:
            return bad
        s = to_text(scalar(eval_any(args[0])))
        if is_error(s):
            return s
        start = to_number(scalar(eval_any(args[1])))
        if is_error(start):
            return start
        count_n = to_number(scalar(eval_any(args[2])))
        if is_error(count_n):
            return count_n
        st, n = math.trunc(start), math.trunc(count_n)
        if st < 1 or n < 0:
            return err("#VALUE!")
        units = s.encode("utf-16-le")
        return units[(st - 1) * 2 : (st - 1 + n) * 2].decode("utf-16-le")

    def _int(args: list) -> Scalar:
        bad = arity(args, 1, 1)
        if bad:
            return bad
        n = to_number(scalar(eval_any(args[0])))
        return n if is_error(n) else math.floor(n)

    def _trunc(args: list) -> Scalar:
        bad = arity(args, 1, 2)
        if bad:
            return bad
        n = to_number(scalar(eval_any(args[0])))
        if is_error(n):
            return n
        places = 0
        if len(args) == 2:
            d = to_number(scalar(eval_any(args[1])))
            if is_error(d):
                return d
            places = math.trunc(d)
        return _round_sig(float(n), places, "down")

    def eval_call(name: str, args: list) -> Scalar:
        fn = funcs.get(name.lower())
        if fn is None:
            return err("#NAME?")
        return fn(args)

    v = eval_any(ast)
    return v
