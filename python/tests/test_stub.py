import pytest

from excel_formula import Evaluator, SpecRevision


def test_spec_revision_exposed() -> None:
    assert Evaluator.spec_revision == SpecRevision


def test_evaluate_not_implemented() -> None:
    ev = Evaluator()
    with pytest.raises(NotImplementedError):
        ev.evaluate("=1+1", {})
