"""Stub evaluator — behavior defined in ../../spec/SPEC.md (not yet implemented)."""

from __future__ import annotations

from typing import Any, Mapping

SpecRevision = "0.1.0"


class EvaluationError(Exception):
    """Raised when a formula cannot be evaluated (see spec §8)."""


class Evaluator:
    """Evaluate Excel-style formulas against a mapping context."""

    spec_revision: str = SpecRevision

    def __init__(
        self,
        *,
        reference_style: str = "A1",
        formula_locale: str = "en-US",
        strict: bool = False,
    ) -> None:
        self.reference_style = reference_style
        self.formula_locale = formula_locale
        self.strict = strict

    def evaluate(self, formula: str, context: Mapping[str, Any]) -> Any:
        """Evaluate ``formula`` using ``context`` for reference lookup.

        Not implemented until spec open questions in §11 are resolved.
        """
        raise NotImplementedError(
            "Formula evaluation is not implemented yet; see spec/SPEC.md and open GitHub issues."
        )
