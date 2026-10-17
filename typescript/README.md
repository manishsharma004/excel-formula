# @excel-formula/core (TypeScript)

TypeScript implementation of [`../spec/SPEC.md`](../spec/SPEC.md).

**Status:** stub — API subject to spec revision.

## Install

```bash
npm install
npm run build
```

## Usage (planned)

```ts
import { Evaluator } from "@excel-formula/core";

const ev = new Evaluator();
const result = ev.evaluate("=price * qty", { price: 9.99, qty: 3 });
```

## Tests

```bash
npm test
```
