from excel_formula import Evaluator, EvaluationError, SpecRevision


def test_spec_revision_exposed() -> None:
    assert Evaluator.spec_revision == SpecRevision == "0.7.0"


def test_leading_equals_is_parse_error() -> None:
    ev = Evaluator()
    try:
        ev.evaluate("=1+1", {})
    except EvaluationError as exc:
        assert exc.kind == "parse"
    else:
        raise AssertionError("expected parse error")


def test_name_expression() -> None:
    assert Evaluator().evaluate("price * qty", {"price": 9.99, "qty": 3}) == 29.97
