# excel-formula

Evaluate Excel-style formulas on objects and arrays. The same expression runs in Python and TypeScript. There is no workbook, no sheet, and no cell range.

```text
evaluate("price * qty", { "price": 9.99, "qty": 3 }) → 29.97
```

A list is a value. Operators on a list are element-wise, so `SUM(values * values)` is the sum of squares and `SUM(values * 2)` multiplies every element, then adds. `SUMSQ` and `SUMPRODUCT` are not functions. `A1` is a name, and `A1:B2` is a parse error. Do not start a formula with `=`.

Behavior is spec **0.8.0** in [`spec/SPEC.md`](spec/SPEC.md). The formula guide is [`REFERENCE.md`](REFERENCE.md). Open questions are in [issue #4](https://github.com/manishsharma004/excel-formula/issues/4).

## Use it

Python:

```python
from excel_formula import Evaluator

ev = Evaluator()
ev.evaluate("price * qty", {"price": 9.99, "qty": 3})  # 29.97
ev.evaluate("SUM(values * values)", {"values": [2, 3]})  # 13
ev.aggregate("SUM(price * qty)", [{"qty": 3}, {"price": 9.99, "qty": 3}])  # 29.97
```

TypeScript:

```ts
import { Evaluator } from "@excel-formula/core";

const ev = new Evaluator();
ev.evaluate("price * qty", { price: 9.99, qty: 3 }); // 29.97
ev.evaluate("SUM(values * 2)", { values: [10, 5] }); // 30
```

`aggregate` evaluates `SUM`, `PRODUCT`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, and `COUNTA` once per record. A missing field is blank, so the call above is `29.97`, not `59.94`. On one object, `SUM(orders.price * orders.qty)` is the same kind of total.

## Packages

| Path | What it is |
|------|------------|
| [`python/`](python/) | `excel_formula` |
| [`typescript/`](typescript/) | `@excel-formula/core` |
| [`playground/`](playground/) | Browser playground (SvelteKit, daisyUI, Monaco, Pyodide) |
| [`spec/`](spec/) | Language-neutral spec and shared fixtures |

Install for development:

```bash
cd python && python3 -m pip install -e .
cd typescript && npm install
```

Tests. Python does not need pytest for the shared fixtures:

```bash
cd typescript && npm test
cd python && python3 tests/run_fixtures.py
```

Both runners read `spec/fixtures/tier0/` and `spec/fixtures/tier1/`. Files under `spec/fixtures/proposed/` are drafts and are not conformance tests.

## Playground

```bash
cd playground && npm install && npm run dev
```

The dev server listens on port 7500. **Guide** opens `REFERENCE.md` in a sidebar on a wide window, or in a dialog on a narrow one. The shortcut is Ctrl+Shift+K.

[GitHub Pages](https://manishsharma004.github.io/excel-formula/) is deployed from `main` by [`.github/workflows/main.yml`](.github/workflows/main.yml).

## Contributing

Change [`spec/SPEC.md`](spec/SPEC.md) in the same commit as the engines and fixtures. Discuss a decision that is still open in [issue #4](https://github.com/manishsharma004/excel-formula/issues/4) before treating it as required. The local mirror of that thread is [`spec/DISCUSSION_ISSUE.md`](spec/DISCUSSION_ISSUE.md).

## License

MIT — see [LICENSE](LICENSE).
