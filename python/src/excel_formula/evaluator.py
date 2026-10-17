"""Stub evaluator — behavior defined in ../../spec/SPEC.md (not yet implemented)."""

from __future__ import annotations

from typing import Any, Mapping

SpecRevision = "0.5.0"


class EvaluationError(Exception):
    """Raised for host errors such as parse failures and limits (see spec §10)."""


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

        Not implemented yet; behavior is defined in spec §4–§13.
        """
        raise NotImplementedError(
            "Formula evaluation is not implemented yet; see spec/SPEC.md and GitHub issue #4."
        )
