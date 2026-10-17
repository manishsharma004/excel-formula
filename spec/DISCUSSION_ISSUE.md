# Design discussion (mirror of issue #4)

**Canonical thread:** https://github.com/manishsharma004/excel-formula/issues/4

This file tracks the issue body for version control. When the issue is updated on GitHub, sync here (or vice versa).

---

## Summary

This is the **canonical design thread** for [excel-formula](https://github.com/manishsharma004/excel-formula): a language-neutral **spec** plus **Python** and **TypeScript** libraries that evaluate Excel-style expressions against an in-memory mapping (dict / object).

**Active spec:** [`spec/SPEC.md`](https://github.com/manishsharma004/excel-formula/blob/main/spec/SPEC.md) revision **0.8.0**. Formulas run on objects and arrays. There are no cell ranges. `SUM(values * values)` and `SUM(values * 2)` replace `SUMSQ` and `SUMPRODUCT`.

**Review and status of every finding:** [`spec/REVIEW.md`](https://github.com/manishsharma004/excel-formula/blob/main/spec/REVIEW.md). **Draft cases, each explained:** [`spec/fixtures/proposed/README.md`](https://github.com/manishsharma004/excel-formula/blob/main/spec/fixtures/proposed/README.md).

## Problem statement

```text
evaluate("price * qty", { "price": 9.99, "qty": 3 }) → 29.97
```

…extended to a documented subset of Excel functions, errors, and coercion — **without** Excel at runtime. Python and TypeScript MUST match on shared fixtures under `spec/fixtures/`.

## Agreed

### Formula input — no leading `=`

`evaluate` takes **expression strings only** (e.g. `price * qty`, `SUM(a, b)`). A leading `=` is a **parse error** (spreadsheet UI only). See spec §2.1, §5.4.

### Single-shot evaluation

Context values are **data**. A string `"price*qty"` in the context is not evaluated as a formula (spec §6.6).

### Records requirement

Aggregation functions MUST accept **lists of records**. A formula with no aggregation function MUST work both as a **calculation** (one record) and as a **query** (a predicate over many records). Spec §2.1. The design that meets it is §12.5, still **Proposed**.

### Excel-compat corrections (spec 0.5.0)

Where the spec contradicted its own Excel compatibility target, 0.5.0 fixed the rule and the fixtures:

| Case | Before 0.5.0 | Now (matches Excel) | Fixture |
|------|--------------|---------------------|---------|
| `"3"=3` | `TRUE` | `FALSE`: comparisons never coerce | `tier0/equality-text-number-unequal` |
| `2^3^2` | `512` (right-assoc) | `64` (left-assoc) | `tier0/power-left-assoc` |
| `"1">2`, `TRUE>1` | `FALSE` (coerced) | `TRUE` (ordered by type) | `tier0/text-greater-than-number-no-coercion`, `boolean-greater-than-number` |
| `1<2<3` | `TRUE` | `FALSE` | `tier0/chained-comparison` |
| `missing<FALSE` | depended on coercion | `FALSE` (blank takes the other side’s type) | `tier0/blank-vs-false-ordered` |
| `COUNT(TRUE, "3", 1)` | `1` | `3` | `tier0/count-direct-boolean-and-numeric-text` |
| `COUNT(1, 1/0)` | `#DIV/0!` | `1` | `tier0/count-direct-error-not-counted` |
| `0^-1` | `#NUM!` | `#DIV/0!` | `tier0/zero-negative-power` |
| `IF(FALSE, 1)` | arity `#VALUE!` | `FALSE` | `tier0/if-two-args` |
| `ROUND(2.675, 2)` | unspecified | `2.68` | `tier1/round-decimal-half` |

Deliberate deviations from Excel are listed in spec §17.4.

### Objects and arrays (spec 0.8.0)

The context is objects and arrays. There is no sheet and no range.

- `A1`, `q1`, and `LOG10` are names. `A1:B2` is a parse error. There is no `referenceStyle` and no `cellReferences` option.
- `SUM(A1, 1)` with `A1` = `TRUE` is `2`. The old question (does a single cell follow range rules?) does not arise.
- Operators on a list are element-wise. `values * 2` with `[10, 5]` is `[20, 10]`. Unequal lengths are `#VALUE!`.
- `SUM(values * values)` is the sum of squares. `SUM(values * 2)` multiplies, then sums. `SUMSQ` and `SUMPRODUCT` are not functions.
- Text inside a product is not skipped: `"n/a" * 2` is `#VALUE!` at that element, and `SUM` of a list that contains the error returns `#VALUE!`. `SUM` of a list still skips text and booleans that were not already multiplied: `SUM([true, 1])` is `1`.
- `evaluate` may return a list or a record. A record used as a scalar operand is still `#VALUE!`.
- `aggregate("SUM(price * qty)", rows)` is unchanged: one evaluation per record. A missing `price` is blank, so `[{qty:3},{price:9.99,qty:3}]` is `29.97`.

## Spec progress (informative)

| Revision | Highlights |
|----------|------------|
| 0.2.0 | Grammar, coercion, Tier 0 functions, limits, fixtures |
| 0.3.0 | §17 use cases, corner-case catalog, existing engines |
| 0.4.0 | **§12.4 proposed:** extensibility for **additional functions** (registry, parameter kinds, packs, security) |
| 0.5.0 | Records requirement recorded; **§12.5 proposed:** records, lists, `filter` / `map`, `SUMX` / `FILTER`. Excel-compat corrections above; clarified tokens, empty arguments, direct vs list arguments; deviation table §17.4 |
| 0.6.0 | Nested paths are required (§6.7). `aggregate("SUM(price * qty)", rows)` evaluates the product once per record (§4.5). A missing `price` is blank, so `[{qty:3},{price:9.99,qty:3}]` is `29.97`, not `59.8`. Both prices at `9.99` would be `59.94`. `filter` / `map` / `SUMX` stay proposed |
| 0.7.0 | `PRODUCT`, `SUMSQ`, and `SUMPRODUCT` were added as Tier 0. Superseded by 0.8.0 |
| 0.8.0 | No spreadsheet ranges. Element-wise operators on arrays. `SUM(values * values)` and `SUM(values * 2)` replace `SUMSQ` and `SUMPRODUCT` |

## Proposed — please discuss

### Records, lists, and query mode (§12.5)

1. **Values** — locked in 0.6.0 (§6.7): records and lists in the context; `orders.price` projects a column. Exact dotted keys still win.
2. **Aggregations over a row list** — locked in 0.6.0 (§4.5): `aggregate("SUM(price * qty)", rows)` sums the product per record. `SUM(orders.price)` still sums the column once. `SUMX` remains proposed.
3. **Row-scoped functions** — `SUMX(list, expr)`, `AVERAGEX`, `MINX`, `MAXX`, `COUNTX`, `COUNTAX`, `COUNTROWS`, `FILTER(list, predicate)`.
4. **One formula, three uses** — `evaluate` (calculation), `filter` (query), `map` (calculated column), plus `compile`.
5. **Scope** — current record, then outer rows, then the root context.
6. **Element-wise lists** — locked in 0.8.0 (§6.5). `SUM(orders.price * orders.qty)` pairs by index. `SUMX` is still the proposed row-formula form.

### Extensibility (§12.4)

1. **One registry** — builtins and `ACME.TAX`-style custom functions use the same registration API.
2. **Options** — `functions: [...]`, `builtins: ["0"] | "all"`.
3. **Parameter kinds** — `number`, `string`, `boolean`, `scalar`, `values`, `lazy`, and (0.5.0) `list` and `perRow` for record functions. There is no rectangle / range kind (0.8.0).
4. **Naming** — custom functions SHOULD use dotted names (`ACME.TAX`); undotted names reserved for spec functions.
5. **Contract** — sync only; no whole-context access; thrown errors → host `function` error.
6. **Volatile** — `TODAY` / `NOW` use an injectable `clock`.
7. **Packs** — versioned multi-language function sets ship their own fixtures.

## Still open (please comment on GitHub #4)

- [ ] **Adopt §12.5** as a tier (“Tier R”), and for which release?
- [ ] **§12.5.7** — per-row scope fallback vs explicit `ROOT.rate`; does `strict` cover record fields; bracket syntax for keys like `[unit price]`; grouping. `cellReferences` and element-wise arrays are decided in 0.8.0 (see Agreed)
- [ ] **Numbers at 15 significant digits** — text rendering (`0.1+0.2 & ""` → `"0.3"`) and equality (`0.1+0.2=0.3`)? (§8.2, §8.4)
- [x] **Single cell references** — **Decided in 0.8.0.** There are no cells. `A1` is a name, so `SUM(A1, 1)` with `TRUE` is `2` (§6.3, §12)
- [ ] **Strict missing name** — `#NAME?` (Excel) instead of `#REF!`? (§6.4)
- [ ] Context model: hybrid flat map + records (§6.1, §12.5) — confirm
- [ ] Dates / serial numbers when Tier 2 lands
- [ ] Locale beyond `en-US`
- [ ] Workbook mode (formulas in context values + dependency graph) — defer?
- [ ] Tier 1 required for first release, or Tier 0 (+ Tier R) only?
- [ ] **§12.4.11** — custom function throws → host error vs `#VALUE!`? allow builtin `override`? async ever? `LAMBDA` in formula text as second extension path?

## Next steps

1. Decide the remaining open checkboxes on [issue #4](https://github.com/manishsharma004/excel-formula/issues/4).
2. Lock those decisions in `spec/SPEC.md`, and promote the matching cases from `spec/fixtures/proposed/`.
3. Keep both engines on spec 0.8.0. Tier 0 is the 54 fixtures in `spec/fixtures/tier0/`; Tier 1 is `spec/fixtures/tier1/`.
