# Proposed fixtures — use cases, scenarios, and cases

This directory holds **draft** JSON cases for behavior that `SPEC.md` marks **Proposed** or **Open**. They are **not** required for conformance. The machine-readable files stay next to this document. The review that motivated them is [`REVIEW.md`](../../REVIEW.md).

| Subdirectory | Spec status | What it covers |
|--------------|-------------|----------------|
| `records/` | Proposed — [§12.5](../../SPEC.md) | Records, lists, `filter` / `map`, row-scoped aggregations |
| `excel-open/` | Open — §8.2, §8.4, §12, §6.4 | Excel behaviors the spec has not decided to match yet |

The Excel corrections that spec **0.5.0** adopted are no longer here. They are conformance fixtures now: 12 in [`../tier0/`](../tier0/) and `round-decimal-half` in [`../tier1/`](../tier1/). Scenario S11 lists them so the story stays in one place.

This page answers three questions:

1. **Use case** — which product problem the cases exist for.
2. **Scenario** — a concrete story, with the sample data, showing how the API is used.
3. **Case** — one fixture: formula, inputs, and the result we expect.

---

## Shared sample data

Most record cases use the same four orders. Row numbers below are **0-based**, which is what `filter` fixtures return.

| Row | id | region | price | qty | discount | paid | What is special |
|-----|----|--------|-------|-----|----------|------|-----------------|
| 0 | 1 | EU | 10 | 2 | 0.1 | true | Clean numeric row. Line total `price * qty` = 20. Net after discount = 18. |
| 1 | 2 | US | 5 | 10 | *(field missing)* | false | Large quantity. Missing discount must act as blank, not as an error. Line total = 50. |
| 2 | 3 | eu | 20 | 1 | null | true | Region differs only by case (`eu` vs `EU`). Discount is explicit null, which is also blank. Line total = 20. |
| 3 | 4 | APAC | `"n/a"` | 3 | 0 | *(field missing)* | Price is text. Any arithmetic on `price` is `#VALUE!`. Discount `0` is a real number, not blank. |

Line totals that succeed: 20, 50, 20. Row 3 fails arithmetic.

Other contexts used by only a few cases are described in that case.

### How a formula is run

| Mode | Call shape | What you get back |
|------|------------|-------------------|
| `evaluate` | One formula and one context object | One value: number, text, boolean, blank, or an error such as `#VALUE!` |
| `filter` | One formula, a list of row records, optional root context | The rows whose formula is TRUE. Fixtures record **which indexes** were kept, not copies of the records. |
| `map` | One formula and a list of rows | One value per row, in the same order. An error stays in that slot; it does not abort the whole list. |

A formula **without** an aggregation (`price * qty`, `region = "EU"`) is a **row formula**. The same text is a calculation when you `evaluate` it on one record, a query when you `filter` with it, and a calculated column when you `map` with it.

Names inside a row look up the **current record first**, then outer rows, then the root context. A key that exists and is `null` is blank; it does **not** fall through to an outer value.

---

## Use cases

### U1 — Price one record

A checkout, a rules engine, or a form has **one object** (`price`, `qty`, `discount`) and a stored formula. There is no grid and no Excel process.

Covered by: `row-calc-one-record`, `row-calc-missing-field-blank`.

### U2 — Query a table

A UI or API asks “which orders match this rule?” The rule is the same kind of formula as U1, evaluated once per record.

Covered by: `row-filter-text-equality-case-insensitive`, `row-filter-missing-field-is-blank`, `row-filter-and`, `row-filter-number-truthy`, `row-filter-string-predicate-errors`, `row-filter-error-raises`, `row-filter-error-exclude`, `empty-filter-api`, `scope-row-then-root`, `query-with-explicit-aggregate`.

### U3 — Add a calculated column

Show `price * qty` beside every order without writing a loop in application code. Bad rows become an error **in that cell**, so the other rows still render.

Covered by: `row-map-calculated-column`.

### U4 — Summarize a list of records

Dashboards and invoices need counts, sums, and averages over JSON arrays, including nested line items. Aggregations must accept a **list of records** and a **column** (one field projected from each record), not only an Excel range like `A1:A10`.

Covered by the `agg-*` cases, `empty-sumx`, `empty-averagex`, `empty-minx`, `empty-countrows`, `scalar-list-text-ignored`, `scope-nested-iterators`, `path-flatten-nested-lists`.

### U5 — Read nested JSON safely

Business payloads are nested (`customer.address.city`, `orders.items.qty`). The evaluator must walk records and lists, and must refuse to treat a whole record or list as a number.

Covered by: `path-nested-record`, `path-through-blank`, `path-into-scalar`, `path-flat-dotted-key-wins`, `record-is-not-a-result`, `list-is-not-a-result`. `q1 * 2` is a Tier 0 name (`name-shaped-like-cell`), not an option.

### U6 — Same formula language as Excel, on purpose

Scalar cases that do **not** use records. Users copy formulas from Excel and expect the same answer. Where the spec used to disagree with Excel, 0.5.0 fixed the rule and moved the case into `tier0/` or `tier1/`. Where the spec has not decided yet, the case stays in `excel-open/` with Excel’s answer as the expectation.

Covered by: the four files under `excel-open/`, plus the promoted cases listed in S11.

---

## Scenarios

### S1 — Invoice line on one order

**Story.** The server stores the formula `price * qty * (1 - discount)` and receives one order object.

**What happens.**

- On order 0 the result is `10 * 2 * 0.9` = 18. The fixture `row-calc-one-record` checks the simpler `price * qty` = 20 on that same object.
- On order 1, `discount` is absent. Blank becomes 0 in arithmetic, so the factor is `1 - 0` and the result is `5 * 10` = 50 (`row-calc-missing-field-blank`).

**Why it matters.** Callers must not pre-fill every optional field with 0. Missing and `null` are blank.

### S2 — “Show me the EU orders” and other filters

**Story.** A list view binds a user-authored rule to `filter`.

**What happens on the four orders.**

| Rule | Rows kept | Why |
|------|-----------|-----|
| `region = "EU"` | 0 and 2 | Text comparison is case-insensitive, so `eu` matches. |
| `discount > 0` | 0 only | Missing and `null` discounts are blank, and blank is 0. Discount `0` on row 3 does not pass. |
| `AND(paid, qty >= 2)` | 0 only | Row 2 is paid but `qty` is 1. Row 3 has no `paid`, so the flag is blank and `AND` is false. |
| `qty` | all four | A non-zero number is TRUE when a condition is required. |
| `region` | none; host error `row` | A region name is text. Text is not a legal condition, so the filter stops. |
| `price * qty > 15` | depends | Rows 0–2 match (20, 50, 20). Row 3 is `#VALUE!` because price is `"n/a"`. |

**Error policy (two fixtures, one rule).**

- Default `onRowError` is `raise`: the bad row aborts the query (`row-filter-error-raises`). The caller learns the data is dirty.
- `onRowError: "exclude"` drops the bad row and returns indexes 0, 1, 2 (`row-filter-error-exclude`).

An empty input list returns an empty result (`empty-filter-api`). Nothing is special-cased as “no data” versus “no match” beyond the empty list itself.

### S3 — Calculated column beside the grid

**Story.** The same `price * qty` used in S1 is run with `map` on all four orders.

**Result.** `[20, 50, 20, #VALUE!]`.

`map` does not use the filter error policy. The error is a value in the output list so the UI can show it on row 3 and still show the other totals (`row-map-calculated-column`).

### S4 — Dashboard over `orders`

**Story.** Context is `{ "orders": [the four records] }`. Formulas name that array. They are `evaluate` calls, not `filter` calls.

**Columns.** `orders.price` is the list `[10, 5, 20, "n/a"]`. `orders.discount` is `[0.1, blank, blank, 0]`. `orders.paid` is `[true, false, true, blank]`.

| Question the dashboard asks | Formula | Result | Case |
|-----------------------------|---------|--------|------|
| How many orders? | `COUNTROWS(orders)` | 4 | `agg-countrows` |
| Sum of prices, skipping the text | `SUM(orders.price)` | 35 | `agg-sum-column-ignores-text` |
| How many numeric prices? | `COUNT(orders.price)` | 3 | `agg-count-column` |
| How many discounts were filled in, including 0? | `COUNTA(orders.discount)` | 2 | `agg-counta-column-blanks` |
| Average discount, ignoring blanks | `AVERAGE(orders.discount)` | 0.05 | `agg-average-column-excludes-blanks` |
| Sum of line totals | `SUMX(orders, price * qty)` | `#VALUE!` | `agg-sumx-error-propagates` |
| Same, treating bad lines as 0 | `SUMX(orders, IFERROR(price * qty, 0))` | 90 | `agg-sumx-iferror` |
| Sum of the price column via a row formula | `SUMX(orders, price)` | 35 | `agg-sumx-equals-sum-column` |
| Sum the paid flags | `SUM(orders.paid)` | 0 | `agg-sum-column-ignores-booleans` |
| How many are paid? | `COUNTROWS(FILTER(orders, paid))` | 2 | `agg-countrows-filter` |
| Revenue for EU (any case) | `SUMX(FILTER(orders, region = "EU"), price * qty)` | 40 | `agg-sumx-filter` |
| Largest quantity | `MAXX(orders, qty)` | 10 | `agg-maxx` |
| How many line totals are numeric? | `COUNTX(orders, price * qty)` | 3 | `agg-countx-ignores-errors` |

`SUM(orders.price)` and `SUMX(orders, price)` are defined to be the same number. Text and booleans inside a column are ignored, the same way Excel ignores them inside a range. A **direct** `SUM(TRUE, 1)` would count the boolean; a boolean **in the column** does not.

`SUM(orders)` is `#VALUE!` (`agg-sum-of-records-is-value`). The array is records, not numbers. Spec 0.8.0 does element-wise arithmetic: `orders.price * 2` is `[20, 10, 40, #VALUE!]` because the last price is `"n/a"` (`no-lifting-operator`). `SUM(orders.price * orders.qty)` is `#VALUE!` for that same text product (`no-lifting-in-sum`), not because multiplication of arrays is refused. Numeric arrays use `SUM(orders.price * orders.qty)` in `tier0/sum-array-product`.

### S5 — No orders yet

**Story.** `{ "none": [] }`, or `filter` on an empty page.

| Formula | Result | Why |
|---------|--------|-----|
| `SUMX(none, x)` | 0 | Sum of nothing is 0. |
| `AVERAGEX(none, x)` | `#DIV/0!` | Average refuses an empty numeric set. |
| `MINX(none, x)` | 0 | Same as Excel `MIN` of no numbers. |
| `COUNTROWS(none)` | 0 | |
| `filter` of `x > 1` on `[]` | `[]` | |

`SUM([1, 2, "3", null])` is 3 (`scalar-list-text-ignored`). A list of scalars uses the same membership rules as a column: the text `"3"` is ignored, it is not coerced.

### S6 — Names from the row and from outside it

**Story.** A rule says `amount > threshold`. `threshold` is not on the order; it is configuration in the root context.

`scope-row-then-root`: rows `[{amount: 50}, {amount: 150}]`, context `{threshold: 100}`. Filter keeps index 1 only.

**Story.** A tax rate usually lives on the company record, but one order overrides it.

`scope-per-row-fallback`: context `{ rate: 2, orders: [{qty: 1, rate: 10}, {qty: 2}] }`, formula `SUMX(orders, qty * rate)`.

- First order uses its own `rate` 10 → `1 * 10`.
- Second order has no `rate` key, so it uses the root `rate` 2 → `2 * 2`.
- Total 14.

`scope-null-key-does-not-fall-back`: the only order is `{qty: 1, rate: null}`. The key **is** present. Blank times quantity is 0. The root `rate` of 2 is **not** used.

This fallback is convenient and also a trap if records are sparse by mistake. REVIEW.md lists it as an open question (`ROOT.rate` versus automatic fallback).

### S7 — Orders that contain line items

**Story.** Two orders, each with an `items` array.

```text
orders[0].items = [{ qty: 2, price: 3 }]
orders[1].items = [{ qty: 1, price: 4 }]
```

- `SUMX(orders, SUMX(items, qty * price))` = `6 + 4` = 10 (`scope-nested-iterators`). The inner formula sees `qty` and `price` on the item, not on the order.
- `SUM(orders.items.qty)` = `2 + 1` = 3 (`path-flatten-nested-lists`). Each list along the path contributes its elements, in order.

### S8 — Compare a row with a summary of the whole set

**Story.** Keep amounts that are strictly above the average of a named list.

Context `all = [{amount: 10}, {amount: 30}]`, and those same two records are the rows. Formula `amount > AVERAGEX(all, amount)`. Average is 20, so only the second row (index 1) is kept (`query-with-explicit-aggregate`).

The aggregate names `all` explicitly. There is no implicit “current group.”

### S9 — Walking and refusing structured values

| Situation | Formula | Context | Result | Case |
|-----------|---------|---------|--------|------|
| Read a nested city | `customer.address.city` | customer → address → city `"Pune"` | `"Pune"` | `path-nested-record` |
| Customer is null | `customer.address.city` | `{customer: null}` | blank | `path-through-blank` |
| Dot into a number | `price.amount` | `{price: 5}` | `#VALUE!` | `path-into-scalar` |
| A real key contains a dot | `tax.rate` | both `"tax.rate": 0.2` and `tax.rate` object 0.1 | 0.2 | `path-flat-dotted-key-wins` |
| Return the customer object | `customer` | a record | `{ name: "A" }` | `record-is-not-a-result` |
| Return the orders array | `orders` | the sample list | the same list | `list-is-not-a-result` |

The exact key `"tax.rate"` wins over navigating `tax` then `rate`, so existing flat fixtures that use dotted names keep working.

### S10 — A field named like a cell

**Story.** JSON from a quarterly report uses the key `q1`.

Formula `q1 * 2`, context `{ "q1": 100 }`.

**Result.** 200. Spec 0.8.0 requires this with no option. The conformance fixture is `tier0/name-shaped-like-cell`. `A1` is a name as well: `SUM(A1, 1)` with `A1` true is `2` (`tier0/sum-a1-is-name`).

### S11 — Excel scalar behavior: fixed in 0.5.0, and still open

These cases have an **empty context** unless noted. They do not use records.

**Fixed in spec 0.5.0.** The spec used to describe these differently from Excel. The rule is now normative, and the fixture moved to a conformance directory.

| Case | Now in | Formula | Expected | What people often implement instead |
|------|--------|---------|----------|-------------------------------------|
| `equality-text-number-unequal` | `tier0/` | `"3"=3` | FALSE | TRUE, because `"3"+1` is 4. Comparisons do **not** coerce (§8.4). Replaces the old `equality-numeric-string`, which expected TRUE. |
| `inequality-text-number` | `tier0/` | `"3"<>3` | TRUE | FALSE, as the pair of the row above. |
| `power-left-assoc` | `tier0/` | `2^3^2` | 64 | 512, if `^` is right-associative like mathematics. Excel goes left to right: `(2^3)^2`. |
| `chained-comparison` | `tier0/` | `1<2<3` | FALSE | TRUE, if comparison chains like Python. Excel does `(1<2)<3`, and `TRUE<3` is false because booleans sort after numbers. |
| `boolean-greater-than-number` | `tier0/` | `TRUE>1` | TRUE | FALSE, if `TRUE` becomes 1 before comparing. |
| `text-greater-than-number-no-coercion` | `tier0/` | `"1">2` | TRUE | FALSE, if the string is parsed as 1. Any text sorts after any number. |
| `blank-vs-false-ordered` | `tier0/` | `missing<FALSE` | FALSE | TRUE, if blank is always the number 0 and then “number < boolean.” Blank takes the other side’s empty value, here `FALSE`. |
| `blank-equals-empty-string` | `tier0/` | `missing=""` | TRUE | Already correct before 0.5.0. It sits beside the ordered case so the two blank rules stay tested together. |
| `zero-negative-power` | `tier0/` | `0^-1` | `#DIV/0!` | `#NUM!`, if every non-finite power is `#NUM!`. |
| `if-two-args` | `tier0/` | `IF(FALSE, 1)` | FALSE | `#VALUE!`, if `IF` requires three arguments. |
| `count-direct-boolean-and-numeric-text` | `tier0/` | `COUNT(TRUE, "3", 1)` | 3 | 1, if only real numbers count. Typed directly, booleans and numeric text count. |
| `count-direct-error-not-counted` | `tier0/` | `COUNT(1, 1/0)` | 1 | `#DIV/0!`, if a direct error always propagates. `COUNT` skips it. |
| `round-decimal-half` | `tier1/` | `ROUND(2.675, 2)` | 2.68 | 2.67, if you scale the binary64 value by 100 and round. |

0.5.0 also added tier-0 cases for rules it clarified rather than reversed: `equality-boolean-number-unequal` (`TRUE=1` is FALSE), `empty-argument-is-parse-error` (`IF(TRUE,,1)`), `sum-name-boolean-is-direct` (`SUM(flag, 1)` with `flag` TRUE is 2), and `text-percent-not-coerced` (`"10%"*1` is `#VALUE!`, a deliberate deviation listed in §17.4). The old `ZZZ1` / `A0` cell-bounds fixtures were removed in 0.8.0: those tokens are names.

**Still open (`excel-open/`).** Excel’s answer is the expectation, but the spec has not adopted it. Each one is a question on issue #4.

| Case | Formula | Excel | Spec 0.5.0 today | Open question |
|------|---------|-------|------------------|---------------|
| `number-to-text-15-digits` | `0.1+0.2 & ""` | `"0.3"` | `"0.30000000000000004"` (shortest round-trip, §8.2) | Use Excel’s 15-significant-digit General format? |
| `equality-15-significant-digits` | `0.1+0.2=0.3` | TRUE | FALSE (exact binary64, §8.4) | Compare numbers at 15 significant digits? This decides whether a rule like `total = 0.3` works. |
| `strict-missing-name-is-name-error` | `missing + 1`, `strict: true` | `#NAME?` | `#REF!` (§6.4) | Switch strict mode to `#NAME?` for names? |

`sum-cell-reference-boolean-ignored` was removed in 0.8.0. `A1` is a name, so `SUM(A1, 1)` with `TRUE` is `2` (`tier0/sum-a1-is-name`). Excel’s one-cell range rule does not apply.

---

## Case catalog

Every JSON file, in the same order as the stories above where possible. “Case” is the file id.

### Records (`records/`)

#### `row-calc-one-record` — U1, S1

- **File:** `records/row-calc-one-record.json`
- **Mode:** `evaluate`
- **Formula:** `price * qty`
- **Inputs:** the first sample order as the whole context (not wrapped in `orders`).
- **Expected:** 20
- **What it checks:** a non-aggregate formula is a calculation on one record.

#### `row-calc-missing-field-blank` — U1, S1

- **File:** `records/row-calc-missing-field-blank.json`
- **Mode:** `evaluate`
- **Formula:** `price * qty * (1 - discount)`
- **Inputs:** sample order 1 (US). `discount` is absent.
- **Expected:** 50
- **What it checks:** a missing field is blank, and blank is 0 in arithmetic, so the discount factor is 1.

#### `row-filter-text-equality-case-insensitive` — U2, S2

- **File:** `records/row-filter-text-equality-case-insensitive.json`
- **Mode:** `filter`
- **Formula:** `region = "EU"`
- **Inputs:** all four sample orders as `rows`.
- **Expected:** indexes 0 and 2
- **What it checks:** `eu` matches `EU`.

#### `row-filter-missing-field-is-blank` — U2, S2

- **File:** `records/row-filter-missing-field-is-blank.json`
- **Mode:** `filter`
- **Formula:** `discount > 0`
- **Inputs:** four sample orders.
- **Expected:** index 0
- **What it checks:** missing and null discounts do not match; numeric 0 does not match either.

#### `row-filter-and` — U2, S2

- **File:** `records/row-filter-and.json`
- **Mode:** `filter`
- **Formula:** `AND(paid, qty >= 2)`
- **Inputs:** four sample orders.
- **Expected:** index 0
- **What it checks:** a missing `paid` is blank, and blank is not TRUE.

#### `row-filter-number-truthy` — U2, S2

- **File:** `records/row-filter-number-truthy.json`
- **Mode:** `filter`
- **Formula:** `qty`
- **Inputs:** four sample orders.
- **Expected:** indexes 0, 1, 2, 3
- **What it checks:** a condition may be a number. Every sample `qty` is non-zero, so every row is kept.

#### `row-filter-string-predicate-errors` — U2, S2

- **File:** `records/row-filter-string-predicate-errors.json`
- **Mode:** `filter`
- **Formula:** `region`
- **Inputs:** four sample orders.
- **Expected:** host error `row`
- **What it checks:** text is not a condition. The failure is reported as a row failure, not as “keep nothing.”

#### `row-filter-error-raises` — U2, S2

- **File:** `records/row-filter-error-raises.json`
- **Mode:** `filter`
- **Formula:** `price * qty > 15`
- **Inputs:** four sample orders. No `onRowError` option (default `raise`).
- **Expected:** host error `row`
- **What it checks:** row 3’s `#VALUE!` aborts the query.

#### `row-filter-error-exclude` — U2, S2

- **File:** `records/row-filter-error-exclude.json`
- **Mode:** `filter`
- **Formula:** `price * qty > 15`
- **Inputs:** four sample orders. Option `onRowError` = `"exclude"`.
- **Expected:** indexes 0, 1, 2
- **What it checks:** the same rule can skip the dirty row instead of aborting. Rows 0–2 all have line totals above 15.

#### `empty-filter-api` — U2, S5

- **File:** `records/empty-filter-api.json`
- **Mode:** `filter`
- **Formula:** `x > 1`
- **Inputs:** `rows` is `[]`.
- **Expected:** no indexes (empty list)
- **What it checks:** filtering nothing yields nothing. The formula is not run.

#### `scope-row-then-root` — U2, S6

- **File:** `records/scope-row-then-root.json`
- **Mode:** `filter`
- **Formula:** `amount > threshold`
- **Inputs:** rows `{amount: 50}` and `{amount: 150}`. Root context `{threshold: 100}`.
- **Expected:** index 1
- **What it checks:** `amount` comes from the row; `threshold` comes from the root because the row has no such key.

#### `query-with-explicit-aggregate` — U2, S8

- **File:** `records/query-with-explicit-aggregate.json`
- **Mode:** `filter`
- **Formula:** `amount > AVERAGEX(all, amount)`
- **Inputs:** rows are `{amount: 10}` and `{amount: 30}`. Root context `all` is that same pair.
- **Expected:** index 1
- **What it checks:** a query may call an aggregate, but only on a collection the formula names.

#### `row-map-calculated-column` — U3, S3

- **File:** `records/row-map-calculated-column.json`
- **Mode:** `map`
- **Formula:** `price * qty`
- **Inputs:** four sample orders.
- **Expected:** 20, 50, 20, `#VALUE!`
- **What it checks:** one row formula fills a column. The bad price stays an error value in position 3.

#### `agg-countrows` — U4, S4

- **File:** `records/agg-countrows.json`
- **Mode:** `evaluate`
- **Formula:** `COUNTROWS(orders)`
- **Inputs:** `{ orders: four sample orders }`.
- **Expected:** 4
- **What it checks:** counting records, not numeric cells. A record that would fail arithmetic still counts.

#### `agg-sum-column-ignores-text` — U4, S4

- **File:** `records/agg-sum-column-ignores-text.json`
- **Mode:** `evaluate`
- **Formula:** `SUM(orders.price)`
- **Inputs:** four sample orders.
- **Expected:** 35
- **What it checks:** `10 + 5 + 20`. The text `"n/a"` is skipped, not coerced and not an error.

#### `agg-count-column` — U4, S4

- **File:** `records/agg-count-column.json`
- **Mode:** `evaluate`
- **Formula:** `COUNT(orders.price)`
- **Inputs:** four sample orders.
- **Expected:** 3
- **What it checks:** only numeric prices count. `"n/a"` does not.

#### `agg-counta-column-blanks` — U4, S4

- **File:** `records/agg-counta-column-blanks.json`
- **Mode:** `evaluate`
- **Formula:** `COUNTA(orders.discount)`
- **Inputs:** four sample orders.
- **Expected:** 2
- **What it checks:** `0.1` and `0` are present. Missing and `null` are blank and are not counted. Zero is not blank.

#### `agg-average-column-excludes-blanks` — U4, S4

- **File:** `records/agg-average-column-excludes-blanks.json`
- **Mode:** `evaluate`
- **Formula:** `AVERAGE(orders.discount)`
- **Inputs:** four sample orders.
- **Expected:** 0.05
- **What it checks:** `(0.1 + 0) / 2`, not divided by 4. A wrong implementation that counts blanks returns 0.025.

#### `agg-sumx-error-propagates` — U4, S4

- **File:** `records/agg-sumx-error-propagates.json`
- **Mode:** `evaluate`
- **Formula:** `SUMX(orders, price * qty)`
- **Inputs:** four sample orders.
- **Expected:** `#VALUE!`
- **What it checks:** `SUMX` evaluates the row formula per record. One `#VALUE!` fails the sum. It does not skip the bad row the way `SUM` skips text.

#### `agg-sumx-iferror` — U4, S4

- **File:** `records/agg-sumx-iferror.json`
- **Mode:** `evaluate`
- **Formula:** `SUMX(orders, IFERROR(price * qty, 0))`
- **Inputs:** four sample orders.
- **Expected:** 90
- **What it checks:** the caller opts into “bad line = 0”. `20 + 50 + 20 + 0`.

#### `agg-sumx-equals-sum-column` — U4, S4

- **File:** `records/agg-sumx-equals-sum-column.json`
- **Mode:** `evaluate`
- **Formula:** `SUMX(orders, price)`
- **Inputs:** four sample orders.
- **Expected:** 35
- **What it checks:** the invariant `SUMX(list, field)` = `SUM(list.field)`, including “text in the column is ignored.”

#### `agg-sum-column-ignores-booleans` — U4, S4

- **File:** `records/agg-sum-column-ignores-booleans.json`
- **Mode:** `evaluate`
- **Formula:** `SUM(orders.paid)`
- **Inputs:** four sample orders.
- **Expected:** 0
- **What it checks:** `true` / `false` inside a column are ignored, so the sum is 0 rather than 2. Use `COUNTROWS(FILTER(...))` to count flags.

#### `agg-countrows-filter` — U4, S4

- **File:** `records/agg-countrows-filter.json`
- **Mode:** `evaluate`
- **Formula:** `COUNTROWS(FILTER(orders, paid))`
- **Inputs:** four sample orders.
- **Expected:** 2
- **What it checks:** `FILTER` keeps records where `paid` is TRUE (rows 0 and 2). Missing `paid` is not TRUE.

#### `agg-sumx-filter` — U4, S4

- **File:** `records/agg-sumx-filter.json`
- **Mode:** `evaluate`
- **Formula:** `SUMX(FILTER(orders, region = "EU"), price * qty)`
- **Inputs:** four sample orders.
- **Expected:** 40
- **What it checks:** EU and `eu` (rows 0 and 2), line totals 20 and 20. The text-price row is not in the filtered list, so it cannot poison the sum.

#### `agg-maxx` — U4, S4

- **File:** `records/agg-maxx.json`
- **Mode:** `evaluate`
- **Formula:** `MAXX(orders, qty)`
- **Inputs:** four sample orders.
- **Expected:** 10
- **What it checks:** per-row maximum. Quantities are 2, 10, 1, 3.

#### `agg-countx-ignores-errors` — U4, S4

- **File:** `records/agg-countx-ignores-errors.json`
- **Mode:** `evaluate`
- **Formula:** `COUNTX(orders, price * qty)`
- **Inputs:** four sample orders.
- **Expected:** 3
- **What it checks:** `COUNTX` counts numeric row results and ignores the `#VALUE!` row, unlike `SUMX`, which propagates it.

#### `agg-sum-of-records-is-value` — U4, S4

- **File:** `records/agg-sum-of-records-is-value.json`
- **Mode:** `evaluate`
- **Formula:** `SUM(orders)`
- **Inputs:** four sample orders.
- **Expected:** `#VALUE!`
- **What it checks:** you cannot sum records. Project a column or use `SUMX`.

#### `no-lifting-operator` — U4, S4

- **File:** `records/no-lifting-operator.json`
- **Mode:** `evaluate`
- **Formula:** `orders.price * 2`
- **Inputs:** four sample orders.
- **Expected:** `[20, 10, 40, #VALUE!]`
- **What it checks:** spec 0.8.0 multiplies the price column by 2. `"n/a" * 2` is `#VALUE!` at that element.

#### `no-lifting-in-sum` — U4, S4

- **File:** `records/no-lifting-in-sum.json`
- **Mode:** `evaluate`
- **Formula:** `SUM(orders.price * orders.qty)`
- **Inputs:** four sample orders.
- **Expected:** `#VALUE!`
- **What it checks:** the products are element-wise, and `"n/a" * 3` makes the sum `#VALUE!`. A numeric pair is `tier0/sum-array-product`.

#### `empty-sumx` — U4, S5

- **File:** `records/empty-sumx.json`
- **Mode:** `evaluate`
- **Formula:** `SUMX(none, x)`
- **Inputs:** `{ none: [] }`.
- **Expected:** 0
- **What it checks:** empty sum is 0, and the row formula is not evaluated.

#### `empty-averagex` — U4, S5

- **File:** `records/empty-averagex.json`
- **Mode:** `evaluate`
- **Formula:** `AVERAGEX(none, x)`
- **Inputs:** `{ none: [] }`.
- **Expected:** `#DIV/0!`
- **What it checks:** empty average is division by zero, matching `AVERAGE` of no numbers.

#### `empty-minx` — U4, S5

- **File:** `records/empty-minx.json`
- **Mode:** `evaluate`
- **Formula:** `MINX(none, x)`
- **Inputs:** `{ none: [] }`.
- **Expected:** 0
- **What it checks:** Excel’s `MIN` of no numbers is 0, not an error and not blank.

#### `empty-countrows` — U4, S5

- **File:** `records/empty-countrows.json`
- **Mode:** `evaluate`
- **Formula:** `COUNTROWS(none)`
- **Inputs:** `{ none: [] }`.
- **Expected:** 0
- **What it checks:** an empty list is a real list of length 0, not a missing name.

#### `scalar-list-text-ignored` — U4, S5

- **File:** `records/scalar-list-text-ignored.json`
- **Mode:** `evaluate`
- **Formula:** `SUM(scores)`
- **Inputs:** `{ scores: [1, 2, "3", null] }`.
- **Expected:** 3
- **What it checks:** a list of scalars follows range membership. `"3"` is text, so it is ignored. `1 + 2` = 3.

#### `scope-per-row-fallback` — U4, S6

- **File:** `records/scope-per-row-fallback.json`
- **Mode:** `evaluate`
- **Formula:** `SUMX(orders, qty * rate)`
- **Inputs:** root `rate` is 2. First order `{qty: 1, rate: 10}`. Second order `{qty: 2}` with no `rate`.
- **Expected:** 14
- **What it checks:** `10*1 + 2*2`. A missing key falls back to the root. An open design question: whether that fallback should require an explicit `ROOT.rate` instead.

#### `scope-null-key-does-not-fall-back` — U4, S6

- **File:** `records/scope-null-key-does-not-fall-back.json`
- **Mode:** `evaluate`
- **Formula:** `SUMX(orders, qty * rate)`
- **Inputs:** root `rate` is 2. The only order is `{qty: 1, rate: null}`.
- **Expected:** 0
- **What it checks:** `null` means the field was provided and is blank. Lookup stops. It does not continue to the root rate.

#### `scope-nested-iterators` — U4, S7

- **File:** `records/scope-nested-iterators.json`
- **Mode:** `evaluate`
- **Formula:** `SUMX(orders, SUMX(items, qty * price))`
- **Inputs:** two orders, one item each: qty/price 2×3 and 1×4.
- **Expected:** 10
- **What it checks:** the inner `SUMX` binds `qty` and `price` from the item record.

#### `path-flatten-nested-lists` — U4, S7

- **File:** `records/path-flatten-nested-lists.json`
- **Mode:** `evaluate`
- **Formula:** `SUM(orders.items.qty)`
- **Inputs:** the same two orders as the nested-iterator case.
- **Expected:** 3
- **What it checks:** `orders.items.qty` is a flat column `[2, 1]`, one level of list per hop.

#### `path-nested-record` — U5, S9

- **File:** `records/path-nested-record.json`
- **Mode:** `evaluate`
- **Formula:** `customer.address.city`
- **Inputs:** `{ customer: { address: { city: "Pune" } } }`.
- **Expected:** `"Pune"`
- **What it checks:** dotted names walk nested records when no flat key exists.

#### `path-through-blank` — U5, S9

- **File:** `records/path-through-blank.json`
- **Mode:** `evaluate`
- **Formula:** `customer.address.city`
- **Inputs:** `{ customer: null }`.
- **Expected:** blank
- **What it checks:** once a step is blank, the rest of the path is blank. It is not `#VALUE!`.

#### `path-into-scalar` — U5, S9

- **File:** `records/path-into-scalar.json`
- **Mode:** `evaluate`
- **Formula:** `price.amount`
- **Inputs:** `{ price: 5 }`.
- **Expected:** `#VALUE!`
- **What it checks:** you cannot read a field of a number.

#### `path-flat-dotted-key-wins` — U5, S9

- **File:** `records/path-flat-dotted-key-wins.json`
- **Mode:** `evaluate`
- **Formula:** `tax.rate`
- **Inputs:** `"tax.rate"` is 0.2, and `tax` is also `{ rate: 0.1 }`.
- **Expected:** 0.2
- **What it checks:** an exact key that contains a dot beats path navigation. This keeps today’s flat `tax.rate` fixtures working.

#### `record-is-not-a-result` — U5, S9

- **File:** `records/record-is-not-a-result.json`
- **Mode:** `evaluate`
- **Formula:** `customer`
- **Inputs:** `{ customer: { name: "A" } }`.
- **Expected:** `{ name: "A" }`
- **What it checks:** spec 0.8.0 returns a record when the formula’s result is that record.

#### `list-is-not-a-result` — U5, S9

- **File:** `records/list-is-not-a-result.json`
- **Mode:** `evaluate`
- **Formula:** `orders`
- **Inputs:** four sample orders under `orders`.
- **Expected:** the same list of orders
- **What it checks:** spec 0.8.0 returns a list when the formula’s result is that list.

### Excel open questions (`excel-open/`)

These are U6, the “still open” half of scenario S11. Context is empty unless noted. The expected value is **Excel’s** answer. Spec 0.5.0 currently gives a different answer, shown under “Spec today”. A runner MUST NOT treat these as conformance cases.

#### `number-to-text-15-digits`

- **File:** `excel-open/number-to-text-15-digits.json`
- **Formula:** `0.1+0.2 & ""`
- **Expected (Excel):** `"0.3"`
- **Spec today:** `"0.30000000000000004"` (shortest round-trip, §8.2).
- **What it checks:** converting a number to text for `&` uses at most 15 significant digits. This matters wherever numbers are shown or concatenated into messages.

#### `equality-15-significant-digits`

- **File:** `excel-open/equality-15-significant-digits.json`
- **Formula:** `0.1+0.2=0.3`
- **Expected (Excel):** TRUE
- **Spec today:** FALSE (exact binary64 comparison, §8.4).
- **What it checks:** whether near-equal results compare equal. A business rule such as `total = 0.3` or `balance = 0` after arithmetic depends on this.

#### `strict-missing-name-is-name-error`

- **File:** `excel-open/strict-missing-name-is-name-error.json`
- **Formula:** `missing + 1`
- **Options:** `strict: true`
- **Expected (Excel):** `#NAME?`
- **Spec today:** `#REF!` (§6.4, tier-0 fixture `missing-name-strict`).
- **What it checks:** which error a typo in a name produces. Excel reports an undefined name as `#NAME?`; the spec keeps `#REF!`.

---

## Counts

| Group | Files | Use cases |
|-------|------:|-----------|
| `records/` | 44 | U1–U5, scenarios S1–S10 |
| `excel-open/` | 3 | U6, scenario S11 (open half) |
| **Total in this directory** | **47** | |

Promoted by spec 0.5.0: 12 cases to `tier0/` and 1 to `tier1/` (listed in S11).

When a case is accepted, move its JSON into `tier0/` or a tier directory, drop the `mode` field if it is `evaluate`, and update this page.
