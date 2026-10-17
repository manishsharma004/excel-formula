# excel_formula

Python implementation of [`spec/SPEC.md`](../spec/SPEC.md) revision 0.8.0. Formulas run on dicts and lists. There are no cell ranges. See the [repository README](../README.md).

```bash
python3 -m pip install -e .
```

```python
from excel_formula import Evaluator

ev = Evaluator()
ev.evaluate("price * qty", {"price": 9.99, "qty": 3})  # 29.97
```

A leading `=` is a parse error.

```bash
python3 tests/run_fixtures.py
```
