"""Parser (spec §5.2). `^` is left-associative."""

from __future__ import annotations

import re

from excel_formula.host import host
from excel_formula.lexer import lex

COMP = {"=", "<>", "<", ">", "<=", ">="}
_CELL = re.compile(r"^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$")


def parse_formula(src: str, max_ast_nodes: int, max_function_args: int) -> dict:
    tokens = lex(src)
    i = 0
    nodes = 0

    def bump() -> None:
        nonlocal nodes
        nodes += 1
        if nodes > max_ast_nodes:
            host("limit", "Formula is too complex")

    def peek():
        return tokens[i] if i < len(tokens) else ("eof",)

    def at(kind: str, value=None) -> bool:
        p = peek()
        if p[0] != kind:
            return False
        return value is None or (len(p) > 1 and p[1] == value)

    def eat():
        nonlocal i
        p = peek()
        i += 1
        return p

    if at("eof"):
        host("parse", "Empty formula")
    if at("op", "="):
        host("parse", "Leading '=' is not allowed")

    def node(ast: dict) -> dict:
        bump()
        return ast

    def parse_cell(raw: str) -> dict:
        m = _CELL.match(raw)
        if not m:
            host("parse", f"Bad cell '{raw}'")
        col = 0
        for ch in m.group(1).upper():
            col = col * 26 + (ord(ch) - 64)
        return {"col": col, "row": int(m.group(2))}

    def primary() -> dict:
        p = peek()
        if p[0] == "num":
            eat()
            return node({"k": "num", "v": float(p[1])})
        if p[0] == "str":
            eat()
            return node({"k": "str", "v": p[1]})
        if p[0] == "bool":
            eat()
            return node({"k": "bool", "v": p[1]})
        if p[0] == "name":
            eat()
            if at("p", "("):
                return call(p[1])
            return node({"k": "name", "v": p[1]})
        if p[0] == "cell":
            eat()
            a = parse_cell(p[1])
            if at("p", ":"):
                eat()
                q = peek()
                if q[0] != "cell":
                    host("parse", "Range must end with a cell")
                eat()
                return node({"k": "range", "a": a, "b": parse_cell(q[1])})
            return node({"k": "cell", **a})
        if at("p", "("):
            eat()
            inner = expr()
            if not at("p", ")"):
                host("parse", "Expected ')'")
            eat()
            return inner
        host("parse", "Expected a value")

    def call(name: str) -> dict:
        eat()
        args: list[dict] = []
        if not at("p", ")"):
            while True:
                if at("p", ",") or at("p", ")"):
                    host("parse", "Empty argument")
                args.append(expr())
                if at("p", ","):
                    eat()
                    continue
                break
        if not at("p", ")"):
            host("parse", "Expected ')'")
        eat()
        if len(args) > max_function_args:
            host("limit", "Too many arguments")
        return node({"k": "call", "name": name, "args": args})

    def unary() -> dict:
        if at("op", "+") or at("op", "-"):
            op = eat()[1]
            return node({"k": "unary", "op": op, "x": unary()})
        return primary()

    def percent() -> dict:
        x = unary()
        while at("op", "%"):
            eat()
            x = node({"k": "pct", "x": x})
        return x

    def binary(nxt, ops: set[str]) -> dict:
        left = nxt()
        while peek()[0] == "op" and peek()[1] in ops:
            op = eat()[1]
            left = node({"k": "bin", "op": op, "l": left, "r": nxt()})
        return left

    def power():
        return binary(percent, {"^"})

    def mul():
        return binary(power, {"*", "/"})

    def add():
        return binary(mul, {"+", "-"})

    def concat():
        return binary(add, {"&"})

    def expr():
        return binary(concat, COMP)

    ast = expr()
    if not at("eof"):
        host("parse", "Unexpected token")
    return ast
