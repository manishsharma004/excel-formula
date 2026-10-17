# excel-formula (Python)

Python implementation of [`../spec/SPEC.md`](../spec/SPEC.md).

**Status:** stub — API subject to spec revision.

## Install (development)

```bash
python -m pip install -e ".[dev]"
```

## Usage (planned)

```python
from excel_formula import Evaluator

ev = Evaluator()
result = ev.evaluate("=price * qty", {"price": 9.99, "qty": 3})
```

## Tests

```bash
python -m pytest
```
