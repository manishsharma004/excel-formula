# @excel-formula/core

TypeScript implementation of [`spec/SPEC.md`](../spec/SPEC.md) revision 0.8.0. Formulas run on objects and arrays. There are no cell ranges. See the [repository README](../README.md).

```bash
npm install
```

```ts
import { Evaluator } from "@excel-formula/core";

const ev = new Evaluator();
ev.evaluate("price * qty", { price: 9.99, qty: 3 }); // 29.97
```

A leading `=` is a parse error.

```bash
npm test
```
