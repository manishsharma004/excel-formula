"""Public evaluator. Behavior is defined in spec/SPEC.md revision 0.8.0."""

from __future__ import annotations

import time
from typing import Any, Mapping

from excel_formula.host import EvaluationError, host
from excel_formula.coerce import to_boolean
from excel_formula.interpret import interpret
from excel_formula.parser import parse_formula
from excel_formula.value import ExcelError, decode_json, encode_json, is_error

SpecRevision = "0.8.0"


def _utf16_len(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


class Evaluator:
    spec_revision = SpecRevision

    def __init__(
        self,
        *,
        formula_locale: str = "en-US",
        strict: bool = False,
        max_formula_length: int = 8192,
        max_ast_nodes: int = 4096,
        max_function_args: int = 255,
        max_range_cells: int = 10000,
        timeout_ms: int | None = None,
        on_row_error: str = "raise",
    ) -> None:
        if formula_locale != "en-US":
            host("unsupported", "Only en-US is supported")
        self.formula_locale = formula_locale
        self.strict = strict
        self.max_formula_length = max_formula_length
        self.max_ast_nodes = max_ast_nodes
        self.max_function_args = max_function_args
        self.max_range_cells = max_range_cells
        self.timeout_ms = timeout_ms
        self.on_row_error = on_row_error

    def evaluate(self, formula: str, context: Mapping[str, Any]) -> Any:
        return encode_json(self._eval(formula, context, []))

    def aggregate(self, formula: str, rows: list, context: Mapping[str, Any] | None = None) -> Any:
        """SUM(price * qty) sums that product on each record."""
        self._require_rows(rows)
        ast = self._parse(formula)
        return encode_json(
            interpret(
                ast,
                self._context(context or {}),
                self.strict,
                self.max_range_cells,
                self.timeout_ms,
                time.perf_counter(),
                [],
                [self._row_scope(row) for row in rows],
            )
        )

    def map(self, formula: str, rows: list, context: Mapping[str, Any] | None = None) -> list:
        self._require_rows(rows)
        ast = self._parse(formula)
        root = self._context(context or {})
        return [encode_json(self._eval_ast(ast, root, [self._row_scope(row)])) for row in rows]

    def filter(self, formula: str, rows: list, context: Mapping[str, Any] | None = None) -> list:
        self._require_rows(rows)
        ast = self._parse(formula)
        root = self._context(context or {})
        kept = []
        for index, row in enumerate(rows):
            value = self._eval_ast(ast, root, [self._row_scope(row)])
            cond = value if is_error(value) else to_boolean(value)
            if isinstance(cond, ExcelError):
                if self.on_row_error == "exclude":
                    continue
                host("row", f"Row {index}: {cond.code}")
            if cond:
                kept.append(row)
        return kept

    def _eval(self, formula: str, context: Mapping[str, Any], scopes: list) -> Any:
        return self._eval_ast(self._parse(formula), self._context(context), scopes)

    def _parse(self, formula: str):
        if not isinstance(formula, str):
            host("parse", "Formula must be a string")
        if _utf16_len(formula) > self.max_formula_length:
            host("limit", "Formula is too long")
        return parse_formula(formula, self.max_ast_nodes, self.max_function_args)

    def _context(self, context: Mapping[str, Any]) -> dict:
        return {k: decode_json(v) for k, v in dict(context or {}).items()}

    def _row_scope(self, row: Any) -> dict:
        if not isinstance(row, dict):
            host("parse", "Each row must be a record")
        return {k: decode_json(v) for k, v in row.items()}

    def _require_rows(self, rows: list) -> None:
        if not isinstance(rows, list):
            host("parse", "rows must be an array")

    def _eval_ast(self, ast, root: dict, scopes: list) -> Any:
        return interpret(
            ast,
            root,
            self.strict,
            self.max_range_cells,
            self.timeout_ms,
            time.perf_counter(),
            scopes,
        )

__all__ = ["Evaluator", "EvaluationError", "SpecRevision"]
