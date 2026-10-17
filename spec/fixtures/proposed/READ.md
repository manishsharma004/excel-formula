# Proposed fixtures (non-normative)

Human-readable catalog of every case under this directory. Machine-readable JSON lives alongside this file.

- **Spec review:** [`REVIEW.md`](../../REVIEW.md)
- **Status:** Not required for conformance until promoted into `SPEC.md` and moved under `tier0/` (or a new tier).
- **Fixture fields:** `mode` (`evaluate` | `filter` | `map`), optional `rows`, optional `options` (`onRowError`, `cellReferences`, …) — see REVIEW Part C.

### Conventions

| Symbol | Meaning |
|--------|---------|
| Row index | 0-based index into the `rows` array for `filter` expectations |
| blank | JSON `null` / missing field per §6.4 (lax) |
| `#VALUE!` etc. | Spreadsheet **error value** (returned, not thrown) |
| host `row` | Evaluation aborted: a row failed during `filter` (proposed §4) |

**Sample orders** (used inline in many fixtures): four records with `id`, `region`, `price`, `qty`, optional `discount`, `paid`.

| Row | region | price | qty | discount | paid | Notes |
|-----|--------|-------|-----|----------|------|-------|
| 0 | EU | 10 | 2 | 0.1 | true | |
| 1 | US | 5 | 10 | *(missing)* | false | |
| 2 | eu | 20 | 1 | null | true | case-insensitive EU match |
| 3 | APAC | "n/a" | 3 | 0 | *(missing)* | text price → `#VALUE!` in arithmetic |

---

## Records, query, and Tier R (`records/`)

### 1. `agg-average-column-excludes-blanks`

- **File:** `records/agg-average-column-excludes-blanks.json`
- **Formula:** `AVERAGE(orders.discount)`
- **Intent:** `AVERAGE(orders.discount)` — denominator excludes blanks (not 4).
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 0.05

### 2. `agg-count-column`

- **File:** `records/agg-count-column.json`
- **Formula:** `COUNT(orders.price)`
- **Intent:** `COUNT(orders.price)` counts numeric cells only.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 3

### 3. `agg-counta-column-blanks`

- **File:** `records/agg-counta-column-blanks.json`
- **Formula:** `COUNTA(orders.discount)`
- **Intent:** `COUNTA(orders.discount)` — `0.1` and `0` count; null/missing do not.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 2

### 4. `agg-countrows-filter`

- **File:** `records/agg-countrows-filter.json`
- **Formula:** `COUNTROWS(FILTER(orders, paid))`
- **Intent:** `COUNTROWS(FILTER(orders, paid))` — two paid rows.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 2

### 5. `agg-countrows`

- **File:** `records/agg-countrows.json`
- **Formula:** `COUNTROWS(orders)`
- **Intent:** `COUNTROWS(orders)` on four orders.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 4

### 6. `agg-countx-ignores-errors`

- **File:** `records/agg-countx-ignores-errors.json`
- **Formula:** `COUNTX(orders, price * qty)`
- **Intent:** `COUNTX(orders, price * qty)` — error row not counted.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 3

### 7. `agg-maxx`

- **File:** `records/agg-maxx.json`
- **Formula:** `MAXX(orders, qty)`
- **Intent:** `MAXX(orders, qty)` → 10.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 10

### 8. `agg-sum-column-ignores-booleans`

- **File:** `records/agg-sum-column-ignores-booleans.json`
- **Formula:** `SUM(orders.paid)`
- **Intent:** `SUM(orders.paid)` — booleans in column ignored like range.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 0

### 9. `agg-sum-column-ignores-text`

- **File:** `records/agg-sum-column-ignores-text.json`
- **Formula:** `SUM(orders.price)`
- **Intent:** `SUM(orders.price)` ignores text `"n/a"` in column (from-range rule).
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 35

### 10. `agg-sum-of-records-is-value`

- **File:** `records/agg-sum-of-records-is-value.json`
- **Formula:** `SUM(orders)`
- **Intent:** `SUM(orders)` — cannot sum list of records.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** Spreadsheet error **#VALUE!**

### 11. `agg-sumx-equals-sum-column`

- **File:** `records/agg-sumx-equals-sum-column.json`
- **Formula:** `SUMX(orders, price)`
- **Intent:** Invariant: `SUMX(orders, price)` = `SUM(orders.price)`.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 35

### 12. `agg-sumx-error-propagates`

- **File:** `records/agg-sumx-error-propagates.json`
- **Formula:** `SUMX(orders, price * qty)`
- **Intent:** `SUMX(orders, price * qty)` — one bad row → `#VALUE!`.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** Spreadsheet error **#VALUE!**

### 13. `agg-sumx-filter`

- **File:** `records/agg-sumx-filter.json`
- **Formula:** `SUMX(FILTER(orders, region = "EU"), price * qty)`
- **Intent:** Sum line totals for EU rows only (`EU` + `eu`).
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 40

### 14. `agg-sumx-iferror`

- **File:** `records/agg-sumx-iferror.json`
- **Formula:** `SUMX(orders, IFERROR(price * qty, 0))`
- **Intent:** Recovery with `IFERROR` inside iterator.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** 90

### 15. `cell-shaped-field-name`

- **File:** `records/cell-shaped-field-name.json`
- **Formula:** `q1 * 2`
- **Intent:** `q1 * 2` with `cellReferences: false` — field not cell `Q1`.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `q1` — see JSON file for values. **Options:** `cellReferences: False`.
- **Expected:** 200

### 16. `empty-averagex`

- **File:** `records/empty-averagex.json`
- **Formula:** `AVERAGEX(none, x)`
- **Intent:** Empty list → `AVERAGEX` = `#DIV/0!`.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ none: [] }`.
- **Expected:** Spreadsheet error **#DIV/0!**

### 17. `empty-countrows`

- **File:** `records/empty-countrows.json`
- **Formula:** `COUNTROWS(none)`
- **Intent:** Empty list → 0 rows.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ none: [] }`.
- **Expected:** 0

### 18. `empty-filter-api`

- **File:** `records/empty-filter-api.json`
- **Formula:** `x > 1`
- **Intent:** `filter` on `[]` → `[]`.
- **Setup:** **Mode:** `filter` (keep rows where formula is TRUE). **Rows:** 0 record(s) — see JSON).
- **Expected:** Keep row index(es):  → 0 row(s)

### 19. `empty-minx`

- **File:** `records/empty-minx.json`
- **Formula:** `MINX(none, x)`
- **Intent:** Empty list → `MINX` = 0 (Excel MIN rule).
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ none: [] }`.
- **Expected:** 0

### 20. `empty-sumx`

- **File:** `records/empty-sumx.json`
- **Formula:** `SUMX(none, x)`
- **Intent:** Empty list → `SUMX` = 0.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ none: [] }`.
- **Expected:** 0

### 21. `list-is-not-a-result`

- **File:** `records/list-is-not-a-result.json`
- **Formula:** `orders`
- **Intent:** Top-level result cannot be a list.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** Spreadsheet error **#VALUE!**

### 22. `no-lifting-in-sum`

- **File:** `records/no-lifting-in-sum.json`
- **Formula:** `SUM(orders.price * orders.qty)`
- **Intent:** `SUM(orders.price * orders.qty)` — must use `SUMX`.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** Spreadsheet error **#VALUE!**

### 23. `no-lifting-operator`

- **File:** `records/no-lifting-operator.json`
- **Formula:** `orders.price * 2`
- **Intent:** `orders.price * 2` — no implicit array arithmetic.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `{ orders: <4 sample orders> }`.
- **Expected:** Spreadsheet error **#VALUE!**

### 24. `path-flat-dotted-key-wins`

- **File:** `records/path-flat-dotted-key-wins.json`
- **Formula:** `tax.rate`
- **Intent:** Flat key `tax.rate` beats path `tax` → `rate`.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `tax.rate`, `tax` — see JSON file for values.
- **Expected:** 0.2

### 25. `path-flatten-nested-lists`

- **File:** `records/path-flatten-nested-lists.json`
- **Formula:** `SUM(orders.items.qty)`
- **Intent:** `SUM(orders.items.qty)` flattens nested lists.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `orders` — see JSON file for values.
- **Expected:** 3

### 26. `path-into-scalar`

- **File:** `records/path-into-scalar.json`
- **Formula:** `price.amount`
- **Intent:** Path past scalar `price` → `#VALUE!`.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `price` — see JSON file for values.
- **Expected:** Spreadsheet error **#VALUE!**

### 27. `path-nested-record`

- **File:** `records/path-nested-record.json`
- **Formula:** `customer.address.city`
- **Intent:** Dotted path `customer.address.city`.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `customer` — see JSON file for values.
- **Expected:** "Pune"

### 28. `path-through-blank`

- **File:** `records/path-through-blank.json`
- **Formula:** `customer.address.city`
- **Intent:** Path through null `customer` → blank.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `customer` — see JSON file for values.
- **Expected:** blank (null)

### 29. `query-with-explicit-aggregate`

- **File:** `records/query-with-explicit-aggregate.json`
- **Formula:** `amount > AVERAGEX(all, amount)`
- **Intent:** Filter rows where `amount` exceeds average of explicit `all` list.
- **Setup:** **Mode:** `filter` (keep rows where formula is TRUE). **Rows:** 2 record(s) — see JSON). **Context:** `all` — see JSON file for values.
- **Expected:** Keep row index(es): 1 → 1 row(s)

### 30. `record-is-not-a-result`

- **File:** `records/record-is-not-a-result.json`
- **Formula:** `customer`
- **Intent:** Record value is not a valid scalar result.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `customer` — see JSON file for values.
- **Expected:** Spreadsheet error **#VALUE!**

### 31. `row-calc-missing-field-blank`

- **File:** `records/row-calc-missing-field-blank.json`
- **Formula:** `price * qty * (1 - discount)`
- **Intent:** Row 2 has no `discount` → blank in `1 - discount` → factor 1.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `id`, `region`, `price`, `qty`, `paid` — see JSON file for values.
- **Expected:** 50

### 32. `row-calc-one-record`

- **File:** `records/row-calc-one-record.json`
- **Formula:** `price * qty`
- **Intent:** Single-record calculation: multiply `price` × `qty` on the first sample order.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `id`, `region`, `price`, `qty`, `discount`, `paid` — see JSON file for values.
- **Expected:** 20

### 33. `row-filter-and`

- **File:** `records/row-filter-and.json`
- **Formula:** `AND(paid, qty >= 2)`
- **Intent:** `AND(paid, qty >= 2)` — row without `paid` is blank → FALSE.
- **Setup:** **Mode:** `filter` (keep rows where formula is TRUE). **Rows:** 4 record(s) (standard orders table)
- **Expected:** Keep row index(es): 0 → 1 row(s)

### 34. `row-filter-error-exclude`

- **File:** `records/row-filter-error-exclude.json`
- **Formula:** `price * qty > 15`
- **Intent:** Same filter with `onRowError: exclude` → keeps rows 0, 1, 2 (indexes of rows that evaluate without error and match).
- **Setup:** **Mode:** `filter` (keep rows where formula is TRUE). **Rows:** 4 record(s) (standard orders table) **Options:** `onRowError: 'exclude'`.
- **Expected:** Keep row index(es): 0, 1, 2 → 3 row(s)

### 35. `row-filter-error-raises`

- **File:** `records/row-filter-error-raises.json`
- **Formula:** `price * qty > 15`
- **Intent:** `filter` with `price * qty > 15`; row 4 errors → default `onRowError` raises host **`row`**.
- **Setup:** **Mode:** `filter` (keep rows where formula is TRUE). **Rows:** 4 record(s) (standard orders table)
- **Expected:** Host error **`row`** (not a spreadsheet error value)

### 36. `row-filter-missing-field-is-blank`

- **File:** `records/row-filter-missing-field-is-blank.json`
- **Formula:** `discount > 0`
- **Intent:** `discount > 0` — missing/null `discount` is blank → 0; only row with `0.1` passes.
- **Setup:** **Mode:** `filter` (keep rows where formula is TRUE). **Rows:** 4 record(s) (standard orders table)
- **Expected:** Keep row index(es): 0 → 1 row(s)

### 37. `row-filter-number-truthy`

- **File:** `records/row-filter-number-truthy.json`
- **Formula:** `qty`
- **Intent:** Numeric `qty` as predicate: non-zero → TRUE (§8.3).
- **Setup:** **Mode:** `filter` (keep rows where formula is TRUE). **Rows:** 4 record(s) (standard orders table)
- **Expected:** Keep row index(es): 0, 1, 2, 3 → 4 row(s)

### 38. `row-filter-string-predicate-errors`

- **File:** `records/row-filter-string-predicate-errors.json`
- **Formula:** `region`
- **Intent:** `region` alone as predicate: string cannot convert to boolean → **`row`** error.
- **Setup:** **Mode:** `filter` (keep rows where formula is TRUE). **Rows:** 4 record(s) (standard orders table)
- **Expected:** Host error **`row`** (not a spreadsheet error value)

### 39. `row-filter-text-equality-case-insensitive`

- **File:** `records/row-filter-text-equality-case-insensitive.json`
- **Formula:** `region = "EU"`
- **Intent:** `region = "EU"` matches `EU` and `eu` (case-insensitive string equality).
- **Setup:** **Mode:** `filter` (keep rows where formula is TRUE). **Rows:** 4 record(s) (standard orders table)
- **Expected:** Keep row index(es): 0, 2 → 2 row(s)

### 40. `row-map-calculated-column`

- **File:** `records/row-map-calculated-column.json`
- **Formula:** `price * qty`
- **Intent:** Same formula as calculation, applied to every row via `map`; row 4 has non-numeric `price` → `#VALUE!` for that element only.
- **Setup:** **Mode:** `map` (one result per row, same order). **Rows:** 4 record(s) (standard orders table)
- **Expected:** List: [20, 50, 20, #VALUE!]

### 41. `scalar-list-text-ignored`

- **File:** `records/scalar-list-text-ignored.json`
- **Formula:** `SUM(scores)`
- **Intent:** `SUM(scores)` on `[1,2,"3",null]` — text in list ignored like range.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `scores` — see JSON file for values.
- **Expected:** 3

### 42. `scope-nested-iterators`

- **File:** `records/scope-nested-iterators.json`
- **Formula:** `SUMX(orders, SUMX(items, qty * price))`
- **Intent:** Nested `SUMX` over `orders` and `items`.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `orders` — see JSON file for values.
- **Expected:** 10

### 43. `scope-null-key-does-not-fall-back`

- **File:** `records/scope-null-key-does-not-fall-back.json`
- **Formula:** `SUMX(orders, qty * rate)`
- **Intent:** Key present with `null` does not fall back to root `rate`.
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `rate`, `orders` — see JSON file for values.
- **Expected:** 0

### 44. `scope-per-row-fallback`

- **File:** `records/scope-per-row-fallback.json`
- **Formula:** `SUMX(orders, qty * rate)`
- **Intent:** Row `rate` overrides root; missing row `rate` uses root `rate` (open design).
- **Setup:** **Mode:** `evaluate` (single expression, one result). **Context:** `rate`, `orders` — see JSON file for values.
- **Expected:** 14

### 45. `scope-row-then-root`

- **File:** `records/scope-row-then-root.json`
- **Formula:** `amount > threshold`
- **Intent:** `amount > threshold` with `threshold` only in root context.
- **Setup:** **Mode:** `filter` (keep rows where formula is TRUE). **Rows:** 2 record(s) — see JSON). **Context:** `threshold` — see JSON file for values.
- **Expected:** Keep row index(es): 1 → 1 row(s)

---

## Excel compatibility corrections (`excel-corrections/`)

### 1. `blank-equals-empty-string`

- **File:** `excel-corrections/blank-equals-empty-string.json`
- **Formula:** `missing=""`
- **Intent:** Blank equals `""`.
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** TRUE

### 2. `blank-vs-false-ordered`

- **File:** `excel-corrections/blank-vs-false-ordered.json`
- **Formula:** `missing<FALSE`
- **Intent:** Excel: blank vs `FALSE` in `<` — blank as typed empty.
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** FALSE

### 3. `boolean-greater-than-number`

- **File:** `excel-corrections/boolean-greater-than-number.json`
- **Formula:** `TRUE>1`
- **Intent:** Excel: `TRUE>1` is TRUE (boolean > number).
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** TRUE

### 4. `chained-comparison`

- **File:** `excel-corrections/chained-comparison.json`
- **Formula:** `1<2<3`
- **Intent:** Excel: `1<2<3` is FALSE.
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** FALSE

### 5. `count-direct-boolean-and-numeric-text`

- **File:** `excel-corrections/count-direct-boolean-and-numeric-text.json`
- **Formula:** `COUNT(TRUE, "3", 1)`
- **Intent:** Excel: direct `COUNT(TRUE,"3",1)` = 3.
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** 3

### 6. `count-direct-error-not-counted`

- **File:** `excel-corrections/count-direct-error-not-counted.json`
- **Formula:** `COUNT(1, 1/0)`
- **Intent:** Excel: error direct arg not counted, not propagated.
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** 1

### 7. `equality-text-number-unequal`

- **File:** `excel-corrections/equality-text-number-unequal.json`
- **Formula:** `"3"=3`
- **Intent:** Excel: text and number never equal in `=`.
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** FALSE

### 8. `if-two-args`

- **File:** `excel-corrections/if-two-args.json`
- **Formula:** `IF(FALSE, 1)`
- **Intent:** Excel: `IF(FALSE,1)` returns FALSE (optional third arg).
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** FALSE

### 9. `inequality-text-number`

- **File:** `excel-corrections/inequality-text-number.json`
- **Formula:** `"3"<>3`
- **Intent:** Excel: `"3"<>3` is TRUE.
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** TRUE

### 10. `number-to-text-15-digits`

- **File:** `excel-corrections/number-to-text-15-digits.json`
- **Formula:** `0.1+0.2 & ""`
- **Intent:** Excel: `0.1+0.2` concatenated → `"0.3"` (15 sig digits).
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** "0.3"

### 11. `power-left-assoc`

- **File:** `excel-corrections/power-left-assoc.json`
- **Formula:** `2^3^2`
- **Intent:** Excel: `2^3^2` = 64 (left-associative `^`).
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** 64

### 12. `round-decimal-half`

- **File:** `excel-corrections/round-decimal-half.json`
- **Formula:** `ROUND(2.675, 2)`
- **Intent:** Excel: `ROUND(2.675,2)` = 2.68 (decimal half-up).
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** 2.68

### 13. `text-greater-than-number-no-coercion`

- **File:** `excel-corrections/text-greater-than-number-no-coercion.json`
- **Formula:** `"1">2`
- **Intent:** Excel: `"1">2` is TRUE (no numeric coercion in order compare).
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** TRUE

### 14. `zero-negative-power`

- **File:** `excel-corrections/zero-negative-power.json`
- **Formula:** `0^-1`
- **Intent:** Excel: `0^-1` is `#DIV/0!`.
- **Setup:** **Mode:** `evaluate` (single expression, one result).
- **Expected:** Spreadsheet error **#DIV/0!**

---

## Summary

| Directory | Cases | Purpose |
|-----------|------:|---------|
| `records/` | 45 | Records/lists, `filter`/`map`, columns, `SUMX`/`FILTER`, scope, paths |
| `excel-corrections/` | 14 | Behaviors that match Excel but differ from current spec §8 / §12 / tier0 |

**Total:** 59 proposed fixtures.

When a case is locked in the spec, copy its JSON into the appropriate `tier*/` folder, drop `mode`/`rows` if the runner only supports `evaluate`, and remove or shorten the entry here after promotion.
