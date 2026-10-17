# Excel formula evaluation on a context object

| Field | Value |
|-------|--------|
| **Status** | Draft — discussion |
| **Revision** | 0.1.0 |
| **Last updated** | 2026-10-17 |

## 1. Purpose

Define behavior that **Python**, **TypeScript**, and future implementations must share when evaluating an Excel-style **formula** using a **context**: a mapping from names and/or cell addresses to runtime values.

Goals:

- Predictable, testable semantics independent of Excel UI
- Suitable for spreadsheets-in-the-browser, ETL, rule engines, and server-side recalc
- Explicit about what is *not* supported (subset of Excel)

Non-goals (initially):

- Reading `.xlsx` files or evaluating workbook-global dependency graphs unless added later
- Perfect binary compatibility with every Excel version quirk

## 2. Terminology

| Term | Meaning |
|------|---------|
| **Formula** | A string, optionally prefixed with `=`, containing Excel expression syntax |
| **Context** | A mapping used to resolve references (see §4) |
| **Cell reference** | Address such as `A1`, `Sheet1!B2`, `$A$1` |
| **Name** | Identifier such as `Revenue`, `tax_rate` (rules TBD) |
| **Value** | A runtime datum: number, string, boolean, date/time, error, or array (see §5) |
| **Evaluator** | Component that parses a formula and returns a value |

## 3. Public API (language-neutral)

Each implementation exposes an **Evaluator** (name may vary by language) constructed with **options**, and provides:

### 3.1 `evaluate(formula, context) -> value`

- **formula**: string. Leading `=` is optional; if present it is stripped before parse.
- **context**: mapping (dict / object). Keys are strings; lookup semantics in §4.
- **returns**: a **Value** (§5) or throws/raises a structured **EvaluationError** (§8).

### 3.2 Options (initial proposal)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `referenceStyle` | `"A1"` \| `"R1C1"` | `"A1"` | How bare references in formulas are interpreted |
| `formulaLocale` | string | `"en-US"` | Function names and argument separators (*open*: full i18n scope) |
| `nullReference` | value | `0` or error | Behavior when a key is missing (*open*) |
| `epoch` | date | Excel 1900 date system | Serial date conversion (*open*) |
| `strict` | boolean | `false` | Reject unknown functions/refs vs. best-effort |

*Open question:* should `evaluate` accept only the context for one “sheet”, with sheet qualifiers in references indexing nested contexts?

### 3.3 Batch evaluation (*future*)

`evaluate_all({ formula: context_key, ... }, context) -> dict` may be added once dependency order and circular reference rules are specified.

## 4. Context and reference resolution

### 4.1 Proposed resolution order

When the parser needs the value of reference `ref`:

1. If `ref` exists as a key in `context` (exact string match), use `context[ref]`.
2. Else if normalized forms exist (e.g. `A1` vs `a1`), apply **case rules** (*open*).
3. Else apply `nullReference` / error per options.

### 4.2 Key conventions (*open — pick one primary model*)

**Model A — Cell-keyed context**

```json
{ "A1": 10, "B1": 20, "C1": "=A1+B1" }
```

Formulas in values might be evaluated in dependency order (batch mode).

**Model B — Name-keyed context**

```json
{ "price": 9.99, "qty": 3, "total": "=price*qty" }
```

References in formulas use identifiers, not necessarily grid addresses.

**Model C — Hybrid**

Support both `A1` and names; names may alias cells.

*Recommendation for v0:* support **Model B (names)** plus optional **A1** addresses without sheet prefix, deferring multi-sheet and structured references.

### 4.3 Sheet references

`Sheet2!A1` — *TBD*: nested context `context["Sheet2"]["A1"]` vs. flat key `"Sheet2!A1"`.

### 4.4 Ranges

`A1:A10` in expressions (e.g. `SUM(A1:A10)`) require either:

- context stores range keys as arrays, or
- evaluator expands addresses to a list of cell keys present in context.

*Open question:* range expansion vs. explicit array values only.

## 5. Value model

### 5.1 Scalar types

| Type | Notes |
|------|--------|
| Number | IEEE double; Excel decimal display is formatting only |
| String | Unicode; double-quote escape rules match Excel |
| Boolean | `TRUE` / `FALSE` |
| Empty | Distinct from `0`? (*open* — Excel empty vs. zero) |
| Error | `#DIV/0!`, `#N/A`, `#VALUE!`, `#REF!`, `#NAME?`, `#NUM!`, `#NULL!` |

Errors propagate through operations per Excel rules unless trapped (`IFERROR`).

### 5.2 Dates and times

Stored as numbers (serial) or as a dedicated type — *open*. Spec must pick one **canonical** representation for cross-language tests.

### 5.3 Arrays

Dynamic arrays and `{1,2;3,4}` — *out of scope for v0* unless we commit to a nested array Value type.

## 6. Formula language subset

### 6.1 Syntax (minimal)

- Literals: numbers, strings, booleans
- Operators: `+ - * / ^`, comparisons, string concat `&`
- Parentheses and function calls `FN(a, b)`
- References as in §4
- Percent suffix `10%` → `0.1` (*confirm*)

### 6.2 Functions (tiered)

**Tier 0 (bootstrap):** `IF`, `AND`, `OR`, `NOT`, arithmetic aggregates `SUM`, `MIN`, `MAX`, `AVERAGE`, `COUNT`, `COUNTA`

**Tier 1:** `IFERROR`, `IFNA`, text `LEFT`/`RIGHT`/`MID`/`LEN`/`CONCAT`, logical comparisons, `ROUND` family

**Tier 2:** lookup `VLOOKUP`/`XLOOKUP`/`INDEX`/`MATCH`, date `TODAY`/`NOW`/`DATE`, conditional `SUMIF`/`COUNTIF`

**Tier 3:** dynamic arrays, lambdas, `LET` — only if we expand Value model

Each tier is gated by spec revision; implementations advertise supported tiers.

### 6.3 Operator precedence

Follow Excel / common spreadsheet rules; document explicitly in a table in a future revision.

## 7. Semantics and edge cases

| Topic | Proposal |
|-------|----------|
| Coercion | Excel-style: `"3"+1` → `4`; document per-operator coercion table |
| Circular refs | Single `evaluate` call does not follow context values that are formulas unless batch mode defines recursion; default: treat formula strings in context as opaque values |
| Whitespace | Ignored per Excel rules |
| `@` implicit intersection | Defer |
| Structured references `Table[Col]` | Defer |

## 8. Errors

Distinguish:

- **ParseError** — invalid syntax
- **NameError** — unknown function or name (if `strict`)
- **ReferenceError** — missing key
- **ValueError** — type mismatch
- **DivZeroError** — division by zero

Map to Excel error values where appropriate so `IFERROR` can handle them.

## 9. Conformance and testing

- Implementations declare `specRevision` they target.
- Shared fixtures: JSON files `{ "formula", "context", "options", "expected" }` under `spec/fixtures/` (*to be added*).
- Optional third-party parity checks against Excel or LibreOffice are manual, not CI-gated initially.

## 10. Related work (informative)

Implementations may borrow ideas from (not dependencies of this spec):

- JavaScript: [formulajs](https://github.com/formulajs/formulajs), [fast-formula-parser](https://github.com/LesterLye/fast-formula-parser)
- Python: [formulas](https://github.com/vinci1it2000/formulas), [pycel](https://github.com/dgorissen/pycel), [xlcalculator](https://github.com/brucemike/xlcalculator)

## 11. Open questions (summary)

1. Primary context model: cell keys, names, or hybrid?
2. Missing keys: `0`, `#REF!`, or configurable?
3. Date representation in context and return values
4. Locale: function names only vs. full decimal/list separator behavior
5. Whether context values can be nested formulas and how dependency order works
6. Minimum function tier for first “1.0” release
7. Security: formula length limits, recursion depth, evaluation timeouts (important for server-side use)

## 12. Revision history

| Revision | Date | Summary |
|----------|------|---------|
| 0.1.0 | 2026-10-17 | Initial draft monorepo scaffold |
