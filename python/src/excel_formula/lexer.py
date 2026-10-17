"""Lexer (spec §5.1)."""

from __future__ import annotations

import re

from excel_formula.host import host

CELL = re.compile(r"^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}$")
IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$")
NUM = re.compile(r"^([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?")


def lex(src: str) -> list[tuple]:
    out: list[tuple] = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        if c in " \t\n\r":
            i += 1
            continue
        if c == '"':
            i += 1
            chars: list[str] = []
            closed = False
            while i < n:
                if src[i] == '"':
                    if i + 1 < n and src[i + 1] == '"':
                        chars.append('"')
                        i += 2
                        continue
                    i += 1
                    closed = True
                    break
                chars.append(src[i])
                i += 1
            if not closed:
                host("parse", "Unterminated string")
            out.append(("str", "".join(chars)))
            continue
        if c in "(),:":
            out.append(("p", c))
            i += 1
            continue
        two = src[i : i + 2]
        if two in ("<=", ">=", "<>"):
            out.append(("op", two))
            i += 2
            continue
        if c in "+-*/^&=<>%":
            out.append(("op", c))
            i += 1
            continue
        if c == "." or c.isdigit():
            m = NUM.match(src[i:])
            if not m:
                host("parse", f"Unexpected '{c}'")
            out.append(("num", m.group(0)))
            i += len(m.group(0))
            continue
        if c.isalpha() or c == "_":
            j = i + 1
            while j < n and (src[j].isalnum() or src[j] in "._"):
                j += 1
            raw = src[i:j]
            i = j
            folded = raw.upper()
            if folded in ("TRUE", "FALSE"):
                out.append(("bool", folded == "TRUE"))
                continue
            next_is_call = i < n and src[i] == "("
            if CELL.match(raw) and not next_is_call:
                out.append(("cell", raw))
                continue
            if not IDENT.match(raw) and not (CELL.match(raw) and next_is_call):
                host("parse", f"Invalid name '{raw}'")
            out.append(("name", raw))
            continue
        host("parse", f"Unexpected character '{c}'")
    out.append(("eof",))
    return out
