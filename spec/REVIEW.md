# Review: `spec/SPEC.md` and issue #4

Reviewed: [`SPEC.md`](./SPEC.md) revision **0.4.0** on `main`, the [issue #4](https://github.com/manishsharma004/excel-formula/issues/4) body, [`DISCUSSION_ISSUE.md`](./DISCUSSION_ISSUE.md), tier-0 fixtures, and the records/query requirement below.

**Status:** Informative design review — not normative until merged into `SPEC.md` via a follow-up PR.

New requirement from the reviewer:

> Aggregation functions must accept **arrays of records**. A normal formula (one with no aggregation function) must work both as a **query formula** (a filter predicate over records) and as a **calculation formula** (a value computed from one record).

The current spec cannot express this. §4.1 makes nested objects opaque (`#VALUE!`), §7.1 has no list or record type, §7.2 says any JSON object that is not an error wrapper is illegal, and §17.4 refuses arrays. So the requirement needs a new value model, a scoping rule, and a query API, not only new functions. Part A proposes that design. Part B lists corrections to the existing text, where several claims about Excel are wrong. Part C has behavior cases with examples, ready to become fixtures.

---

## Part A — Records, collections, aggregation, and query mode

### A.1 Design summary

| # | Decision | Proposal |
|---|----------|----------|
| A1 | New value kinds | **Record** (string-keyed map) and **List** (ordered array) are allowed as context values, at any depth. Like ranges, they are **non-scalar**. They can be navigated and passed to collection-aware functions. They cannot be operator operands. A top-level result that is a record or list is `#VALUE!`. |
| A2 | Field access | Dotted path `customer.address.city`. Each segment looks up one key in a record. |
| A3 | Projection | A path that passes through a list produces a **column**: one value per element, in array order. `orders.amount` → `[a1, a2, …]`. Nested lists flatten one level per hop: `orders.items.qty` is every item's `qty` across all orders, depth-first in array order. |
| A4 | Collection arguments | Aggregations (`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `AND`, `OR`, `CONCAT`) accept a list or column wherever they accept a range. Elements use **from-range** membership rules (§12.1): text and booleans are ignored by `SUM`, blanks are ignored, errors propagate (except in `COUNT`/`COUNTA`). |
| A5 | Row-scoped aggregations | New functions take a list of records plus a **row formula** that is evaluated once per record: `SUMX(list, expr)`, `AVERAGEX`, `MINX`, `MAXX`, `COUNTX`, `COUNTAX`, plus `COUNTROWS(list)` and `FILTER(list, predicate)`. `expr` and `predicate` are `lazy` parameters (§12.4.4), so this needs no private hooks. |
| A6 | One formula, three uses | A formula with no aggregation is a **row formula**. The same text works in `evaluate` (one record, calculation), in `filter` (many records, query), in `map` (many records, calculated column), and as the `expr` or `predicate` argument of A5 functions. |
| A7 | Scope | Inside a row (in `filter`/`map`, or inside an A5 function), a name resolves first to the **current record**, then to enclosing rows (for nested iterators), then to the root context. |
| A8 | No implicit lifting | `orders.price * orders.qty` is `#VALUE!` in this revision. Use `SUMX(orders, price * qty)`. Element-wise array arithmetic in the style of Excel 365 is a separate decision (A.6). |

### A.2 Why `SUMX(list, expr)` and not `SUM(list, expr)`

`SUM(orders, price*qty)` reads well, but the spec cannot adopt it:

1. In Excel, `SUM(a, b)` means `a + b`. `SUM(orders, 5)` would have two meanings.
2. Whether `price*qty` is evaluated per row (lazy) or once in the outer scope (eager) would depend on the runtime type of the first argument. The registry in §12.4.4 fixes parameter kinds when a function is registered, and it should stay that way.
3. In the outer scope `price` is usually missing, so the eager reading silently evaluates to blank. With `strict: false`, `SUM(orders, price*qty)` would return `0` instead of failing.

The `X` suffix is DAX's established convention for "iterate rows, evaluate an expression per row" (`SUMX`, `AVERAGEX`, `COUNTROWS`, `FILTER`). It has no dot, so it fits §12.4.3, which reserves undotted names for spec functions.

**Invariant to state normatively:** `SUMX(L, f)` equals `SUM` applied to the column produced by `map(f, L)`, with from-range membership. So `SUMX(orders, price)` equals `SUM(orders.price)`. The same holds for `AVERAGEX`, `MINX`, `MAXX`, `COUNTX`, and `COUNTAX`. This single rule settles every membership question for the new functions.

### A.3 Proposed API additions (§4)

```text
evaluate(formula, context)              → value          # calculation (unchanged)
filter(formula, rows, context?)         → rows           # query: keep rows whose result is TRUE
map(formula, rows, context?)            → list of values # calculated column, same order as rows
compile(formula)                        → Program        # parse once; Program.evaluate / .filter / .map
Program.references                      → names and paths read
Program.functions                       → functions called
Program.isRowFormula                    → true when no aggregation or collection function is called
```

Rules:

- `rows` is a list of records. Each record is the row scope. `context` (default `{}`) is the root scope.
- `filter` keeps a row when its result converts to `TRUE` under §8.3. `FALSE`, `0`, and blank drop the row. A string result is `#VALUE!` for that row.
- A row whose result is an **error value**: `filter` raises a new host error kind, `row`, which carries the row index and the error code. An option `onRowError: "raise" | "exclude"` defaults to `"raise"`. `map` puts error values in its output list, because a list of values can hold them.
- `filter` returns the input record objects (same identity, same order). It does not return copies.
- Aggregations are allowed inside `filter` and `map` when they name a collection explicitly, for example `amount > AVERAGEX(orders, amount)`. There is no implicit "current group". Implementations MAY memoize a subexpression that does not read row scope, so that this pattern does not cost O(n²).
- `timeoutMs` MUST be polled at least between rows.
- New limit `maxRows` (default `10000`). It applies to `filter`/`map` input and to every list an iterator materializes. Column projection already counts against `maxRangeCells`.

### A.4 Proposed normative text (drop-in for a new §6.7)

> **§6.7 Records and lists.** A context value MAY be a record (string-keyed mapping) or a list. Records and lists are non-scalar. A path `a.b.c` resolves `a` in the current scope (§6.8), then each next segment as a key of the record reached so far. If a segment reaches a list, the rest of the path applies to every element, and the result is a column (a list) in element order. A list nested in a list flattens one level. A segment applied to blank yields blank. A segment applied to any other scalar yields `#VALUE!`. A key missing from a record follows §6.4 (blank, or `#REF!` when `strict`). A record or list used as an operator operand, a scalar parameter, or the top-level result is `#VALUE!`.
>
> **§6.8 Scope.** Evaluation has a stack of scopes. The root scope is the context. `filter`, `map`, and each row of a row-scoped function push the current record. A bare name resolves in the innermost scope **whose record contains that key, even when the value is null**. If no scope contains the key, §6.4 applies.
>
> **§6.9 Flat dotted keys.** An exact key containing `.` in a scope (for example `"tax.rate"`) wins over path navigation in that scope. This keeps §6.2 compatible.

### A.5 Function table (new tier, suggested "Tier R")

| Function | Params | Result | Empty list |
|----------|--------|--------|------------|
| `COUNTROWS(list)` | `list` | Number of elements | `0` |
| `FILTER(list, predicate)` | `list`, `lazy` | List of the records whose predicate is TRUE (§8.3). An error in a predicate propagates as the result, as Excel's `FILTER` does. | Empty list |
| `SUMX(list, expr)` | `list`, `lazy` | Invariant A.2 with `SUM` | `0` |
| `AVERAGEX(list, expr)` | `list`, `lazy` | Invariant A.2 with `AVERAGE` | `#DIV/0!` |
| `MINX` / `MAXX(list, expr)` | `list`, `lazy` | Invariant A.2 with `MIN`/`MAX` | `0` (Excel `MIN` rule) |
| `COUNTX(list, expr)` | `list`, `lazy` | Counts numeric results; errors ignored | `0` |
| `COUNTAX(list, expr)` | `list`, `lazy` | Counts non-blank results | `0` |

This also requires a parameter kind `list` in §12.4.4: the implementation receives a list, and a scalar argument is `#VALUE!`. A column (A3) is a list of scalars, so `COUNTROWS(orders.items)` counts all items.

Excel-style conditional aggregates on columns (`SUMIFS(orders.amount, orders.region, "EU")`) fit naturally once Tier 2 defines criteria strings such as `">10"`. They need no further record-specific rules.

### A.6 Open questions this adds to issue #4

1. **Per-row name fallback (A7).** If one record lacks `rate`, `qty*rate` silently uses the root `rate` for that row (case R-G2). That is convenient for `amount > threshold`, but it is a trap with heterogeneous records. Should there be an explicit qualifier, for example `ROOT.rate`, or `@rate` meaning "current row only"?
2. **Missing field vs missing name.** Records are often sparse. Should `strict` cover missing record fields, or only top-level names? A separate `missingField: "blank" | "error"` option is one choice.
3. **Keys that are not identifiers.** Keys with spaces or hyphens, keys starting with a digit, and cell-shaped keys (`q1`, `vat20`, `area51`) cannot be written today. Proposal: bracket escape `[unit price]`, `order.[q1]`, borrowed from Excel structured references.
4. **Element-wise lifting** in the style of Excel 365 (`SUM(orders.price * orders.qty)`, `orders.price > 10` returning a boolean column). That needs a real array type. Defer it, but say so in §17.4.
5. **Grouping** (`groupBy(keyFormula, aggFormula, rows)`): defer it, or define it now?
6. **JSON escaping** for real records that contain a `$type` key (§7.2 wrapper collision). Proposal: `{"$type":"record","value":{…}}`.

### A.7 Spec sections that must change

| Section | Change |
|---------|--------|
| §1 Non-goals, §17.4 | Arrays are no longer refused as **inputs**. Array **results** and array arithmetic stay deferred. |
| §3 Terminology | Add Record, List, Column, Row scope, Row formula, Aggregate formula. |
| §4 | Add `filter`, `map`, `compile`, `onRowError`, `maxRows`, host error `row`. |
| §4.1 | Remove "nested objects are opaque → `#VALUE!`". |
| §6.2 | Dotted identifier = path (A.4), with exact flat keys taking precedence. |
| §7.1, §7.2 | Add record and list. JSON object = record. Reserve `$type`. |
| §12.4.4 | Add parameter kind `list`. Lists and columns are accepted by `values`. |
| §12.1 | Every "range" rule also says "range, list, or column". |
| §15.2 | Fixture fields `mode`, `rows`, and `onRowError` (Part C). |
| §17.1 | The "Rule engine on JSON" use case gains filter/map examples. |

---

## Part B — Corrections to the existing spec

Severity: **High** means the spec states Excel behavior incorrectly, or contradicts itself, in a way that shipping fixtures would lock in.

### B.1 Factual Excel-compatibility errors

| # | Sev | Where | Spec says | Excel actually | Fix |
|---|-----|-------|-----------|----------------|-----|
| 1 | High | §8.4 step 6, §17.3, fixture `equality-numeric-string` | `"3"=3` → `TRUE` | `FALSE`. Excel comparisons never coerce text to number. | Delete step 6. Flip the fixture to `false`. Unlike types are unequal (step 7). The "intentional split" paragraph in §8.5 then goes away, because Excel is consistent: no coercion in comparisons. |
| 2 | High | §5.2 | `^` is right-associative | Excel evaluates `^` **left to right**: `2^3^2` = `64`, not `512`. | `^` is left-associative. The grammar line `power := percent ("^" percent)*` already reads as left-associative, so only the prose is wrong. |
| 3 | High | §8.5 step 3 | "If both sides **convert** to numbers, compare numerically" | This contradicts step 5 and the spec's own example: `"3"` converts to 3, so `"3">2` would be compared numerically and give TRUE for the wrong reason, and `"1">2` would give FALSE where Excel gives TRUE. Booleans convert too, so `TRUE>1` would be FALSE where Excel gives TRUE. | Make the step type-based: "if both sides **are** numbers". Strings only compare with strings. Cross-type order number < text < boolean applies with no coercion. |
| 4 | High | §5.2, §17.3 | `1<2<3` → `(TRUE)<3` "after boolean→number", implying `TRUE` | `TRUE<3` is `FALSE` in Excel (boolean > number). | Expected `FALSE`. Remove "then coerced". |
| 5 | Med | §8.5 step 2 | Blank becomes `0` | Excel compares blank as the **other operand's type's** empty value: `0`, `""`, or `FALSE`. Today `missing < FALSE` is `FALSE` only because step 3 also coerces `FALSE` to 0. Once #3 is fixed, blank → 0 makes it number < boolean = `TRUE`; Excel gives `FALSE`. Also `missing < "a"` must compare as `"" < "a"`. | Fix together with #3: blank takes the other side's type. Blank vs blank is equal. |
| 6 | Med | §12.1 `COUNT` | Booleans and text never count; a direct error propagates | Excel's documentation: logical values and text representations of numbers typed **directly** as arguments are counted. Error arguments are not counted and do not propagate. `COUNT(TRUE, "3", 1/0)` = `2`. | Align with Excel, or list this as a deliberate deviation in §17.3. |
| 7 | Med | §13 `^` | Non-finite → `#NUM!` | `0^-1` is `#DIV/0!` in Excel. | Add: base `0` with a negative exponent → `#DIV/0!`. |
| 8 | Med | §12.1 `IF` | Exactly 3 arguments | Excel accepts 2. `IF(FALSE, 1)` → `FALSE`. | 2–3 arguments. A missing `if_false` yields `FALSE`. |
| 9 | Med | §8.1 | `"10%"` does not convert, and this is presented as Excel behavior | Excel arithmetic coerces `"10%"` → `0.1` (also `"$1,000"`, dates, `"1 1/2"`). | Keep the narrow rule if you want it, but list it in §17.3 as a **deliberate deviation**, with a fixture. |
| 10 | Med | §8.2, §15.2 | Number → text uses the shortest round-trip, so `0.1+0.2 & ""` → `"0.30000000000000004"` | Excel uses at most 15 significant digits: `"0.3"`. Large numbers switch to `1E+21` form. | Pick one. For an "Excel-compatible" claim, use 15 significant digits plus Excel's General-format exponent rules. Either way, add fixtures. |
| 11 | Med | §8.4 / §7.1 | Pure binary64 equality | Excel's final-step comparison treats some near-equal values as equal (`0.1+0.2=0.3` is `TRUE` in desktop Excel; verify). Rule engines will hit this immediately. | Decide explicitly. Option: compare numbers after rounding to 15 significant digits. The `1e-9` fixture tolerance only hides this in **results**, not in comparisons, `IF` conditions, or `filter` predicates. |
| 12 | Med | §12.2 `ROUND` | "Round half away from zero" on binary64 | `ROUND(2.675, 2)` is `2.68` in Excel. A naive `x*100` rounding gives `2.67`, because 2.675 is stored as 2.67499999…. | Define the algorithm: round the 15-significant-digit decimal representation, or use decimal arithmetic. Add this case as a fixture. |
| 13 | Low | §6.4 | Strict missing **name** → `#REF!` | An undefined name in Excel is `#NAME?`. | Consider `#NAME?` for names and `#REF!` for cells. If `#REF!` stays, note it as a deviation. |

### B.2 Internal inconsistencies and editorial errors

| # | Where | Problem | Fix |
|---|-------|---------|-----|
| 14 | Header, §1, §15.1 on this branch | Revision says **0.3.0**, but the revision history's top row is 0.4.0 and `fixtures/README.md` says 0.4.0. `main` says 0.4.0. | Rebase on `main`, or bump all three places. |
| 15 | §4.2 `maxFunctionArgs` | The sentence contradicts itself ("ranges expanded … before this check only when … a range counts as one"). | "A range, list, or column counts as one argument." |
| 16 | §4.4 | "names MAY differ (`strict` vs `strict`)" — the two names are identical. | Use a real example (`max_formula_length` vs `maxFormulaLength`), or drop the clause. |
| 17 | §14 | "There is no user-defined function" contradicts §12.4. | "Custom functions (§12.4) run host code; limits still apply." |
| 18 | §4.2 `maxFormulaLength` | Letting each implementation pick UTF-16 or code points defeats cross-language parity. | Use UTF-16 code units, matching `LEN`. |
| 19 | §5.1 cell regex | Allows `A0`, rows above 1048576, and columns above `XFD` (`ZZZ1`). §6.3 checks rows but not columns. | Out-of-range column or row → `#REF!` (or parse as a name; decide). State the `XFD` (16384) limit. |
| 20 | §5.1 number | "optional digits, optional fraction" also matches `.`, `1.`, and the empty string. | Give a regex: `(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?`, and state whether `1.` is valid. |
| 21 | §5.1 identifier | `[A-Za-z0-9_.]*` admits `a..b`, `a.`, `.a` (after the first character). With paths these become ambiguous. | Use segments: `seg(\.seg)*`, where `seg = [A-Za-z_][A-Za-z0-9_]*`. |
| 22 | §5.2 grammar | No empty arguments (`IF(a,,b)`, `ROUND(x,)`), which Excel allows and treats as blank or 0. `LEFT` says "`n` omitted" but means "fewer arguments", not an empty slot. | Either make an empty slot a parse error, or allow it as blank. State which. |
| 23 | §5.1 vs §6.2 | **Cell-shaped field names.** `q1`, `vat20`, `tax2024`, `abc1` are cell references, so `{ "q1": 100 }` with `q1*2` → `0` in lax mode, silently. JSON rule-engine data is full of keys like these. | Add `cellReferences: true | false` (default `false` when names or records are used, or at least in `filter`/`map`), and/or a `[q1]` escape (A.6 #3). |
| 24 | §9 | "Prefer the leftmost error" conflicts with AND/OR, which evaluate everything; that is fine, but the statement is not tied to §11 for functions. | "Error from the first argument, in evaluation order, that yields one." |
| 25 | §12.4.3 vs paths | `ACME.TAX` without `(` would now be a path (`ACME` → `TAX`). | Note that dotted function names are only recognized before `(`. |
| 26 | §7.2 | `$type` wrappers collide with genuine records that have a `$type` key. | Reserve the key and add an escape (A.6 #6). |
| 27 | §12.4.7 | The volatile flag result shape is still Open, yet "MUST NOT cache" is normative. | Lock a shape (`evaluateDetailed → {value, volatile, references}`). It also serves `compile().references`. |

### B.3 Issue #4 checklist — suggested positions

| Open item | Suggestion |
|-----------|------------|
| Context model: names, cells, or hybrid? | **Names + records + lists** by default. Cells are opt-in (`cellReferences: true`) because of B.2 #23. |
| Missing keys: lax vs strict | Keep both, defaulting to lax. Add A.6 #2 for fields. Recommend `strict` in docs for `filter`, because a typo otherwise yields an empty result instead of an error. |
| Dates | Still defer, but reserve a JSON wrapper (`{"$type":"date","value":"2026-10-17"}`) now, so records that carry ISO strings are not mistaken for dates later. |
| Tier 1 for first release? | Tier 0 + Tier R (records). Tier R is the stated product requirement; Tier 1 text functions are less critical. |
| §12.4.11 Q1 (throw → host error) | Agree with host error `function`. |
| §12.4.11 Q4 (`lazy` for custom functions) | Yes. Tier R (`SUMX`, `FILTER`) needs `lazy` plus row scope through the public API, which proves the registry design. The call context must expose "evaluate this thunk with this record pushed as a scope". |

---

## Part C — Behavior cases (with examples)

Fixture schema extension for §15.2:

```json
{
  "id": "…",
  "mode": "evaluate | filter | map",
  "formula": "…",
  "context": { },
  "rows": [ ],
  "options": { "onRowError": "raise" },
  "expected": "value for evaluate; list of row indexes for filter; list of values for map"
}
```

`mode` defaults to `evaluate`. For `filter`, `expected` lists the **0-based indexes** of the kept rows, so fixtures do not need to compare records by identity.

Shared dataset `ORDERS` used below:

```json
[
  { "id": 1, "region": "EU",   "price": 10,    "qty": 2,  "discount": 0.1, "paid": true },
  { "id": 2, "region": "US",   "price": 5,     "qty": 10,                  "paid": false },
  { "id": 3, "region": "eu",   "price": 20,    "qty": 1,  "discount": null, "paid": true },
  { "id": 4, "region": "APAC", "price": "n/a", "qty": 3,  "discount": 0 }
]
```

### C.1 One row formula, three uses (the core requirement)

| ID | Mode | Formula | Input | Expected | Rule |
|----|------|---------|-------|----------|------|
| R-A1 | evaluate | `price * qty` | `ORDERS[0]` as context | `20` | Calculation on one record |
| R-A2 | map | `price * qty` | rows = `ORDERS` | `[20, 50, 20, #VALUE!]` | Calculated column. `"n/a"*3` is `#VALUE!` per row. `map` keeps error values. |
| R-A3 | filter | `price * qty > 15` | rows = `ORDERS` | host error `row` (row 3, `#VALUE!`) | Default `onRowError: "raise"` |
| R-A4 | filter | `price * qty > 15` | rows = `ORDERS`, `onRowError: "exclude"` | `[0, 1, 2]` | Excluded error rows |
| R-A5 | filter | `region = "EU"` | rows = `ORDERS` | `[0, 2]` | §8.4 case-insensitive text equality |
| R-A6 | filter | `qty > 2` | rows = `ORDERS` | `[1, 3]` | |
| R-A7 | filter | `discount > 0` | rows = `ORDERS` | `[0]` | Missing or null `discount` → blank → `0 > 0` is FALSE |
| R-A8 | filter | `AND(paid, qty >= 2)` | rows = `ORDERS` | `[0]` | Row 3 has no `paid` → blank → FALSE (§8.3) |
| R-A9 | filter | `qty` | rows = `ORDERS` | `[0, 1, 2, 3]` | Non-zero number → TRUE (§8.3) |
| R-A10 | filter | `region` | rows = `ORDERS` | host error `row` (row 0, `#VALUE!`) | A string predicate cannot convert to boolean |
| R-A11 | evaluate | `price * qty * (1 - discount)` | `ORDERS[1]` | `50` | Missing field → blank → `1 - 0` |

### C.2 Aggregations over a list of records

Context for all rows in this table: `{ "orders": ORDERS }`.

| ID | Formula | Expected | Rule |
|----|---------|----------|------|
| R-B1 | `COUNTROWS(orders)` | `4` | |
| R-B2 | `SUM(orders.price)` | `35` | Column; text `"n/a"` ignored (from-range rule) |
| R-B3 | `COUNT(orders.price)` | `3` | |
| R-B4 | `COUNTA(orders.discount)` | `2` | `0.1` and `0` count; null and missing are blank |
| R-B5 | `AVERAGE(orders.discount)` | `0.05` | Blanks excluded from the denominator. A naive implementation divides by 4 → `0.025`. |
| R-B6 | `SUMX(orders, price * qty)` | `#VALUE!` | Row 3 produces an error; errors propagate |
| R-B7 | `SUMX(orders, IFERROR(price * qty, 0))` | `90` | User-chosen recovery |
| R-B8 | `SUMX(orders, price)` | `35` | Invariant A.2: equals `SUM(orders.price)` |
| R-B9 | `SUM(orders.paid)` | `0` | Booleans in a column are ignored, as in a range |
| R-B10 | `COUNTROWS(FILTER(orders, paid))` | `2` | The right way to count flags |
| R-B11 | `SUMX(FILTER(orders, region = "EU"), price * qty)` | `40` | Rows 0 and 2 |
| R-B12 | `MAXX(orders, qty)` | `10` | |
| R-B13 | `COUNTX(orders, price * qty)` | `3` | The error row is not counted |
| R-B14 | `SUM(orders)` | `#VALUE!` | A list of records is not a list of numbers |
| R-B15 | `orders.price * 2` | `#VALUE!` | No implicit lifting (A8) |
| R-B16 | `SUM(orders.price * orders.qty)` | `#VALUE!` | Same; use `SUMX` |
| R-B17 | `orders` | `#VALUE!` | A list is not a top-level result |
| R-B18 | `SUM(orders, 5)` | `#VALUE!` | `SUM` does not take a row formula (A.2) |

### C.3 Empty and degenerate collections

Context: `{ "none": [] }`.

| ID | Formula / mode | Expected |
|----|----------------|----------|
| R-C1 | `SUMX(none, x)` | `0` |
| R-C2 | `AVERAGEX(none, x)` | `#DIV/0!` |
| R-C3 | `MINX(none, x)` | `0` |
| R-C4 | `COUNTROWS(none)` | `0` |
| R-C5 | `COUNTROWS(FILTER(none, TRUE))` | `0` |
| R-C6 | `filter("x > 1", rows = [])` | `[]` |
| R-C7 | `SUM(scores)` with `{ "scores": [1, 2, "3", null] }` | `3` (`"3"` is text in a list → ignored) |

### C.4 Scope and shadowing

| ID | Mode | Formula | Context / rows | Expected | Rule |
|----|------|---------|----------------|----------|------|
| R-D1 | filter | `amount > threshold` | context `{ "threshold": 100 }`, rows `[{ "amount": 50 }, { "amount": 150 }]` | `[1]` | Row field, then root |
| R-D2 | evaluate | `SUMX(orders, qty * rate)` | `{ "rate": 2, "orders": [{ "qty": 1, "rate": 10 }, { "qty": 2 }] }` | `14` | Row 0 uses its own `rate` (10). Row 1 falls back to root `rate` (2). This is the A.6 #1 trap. |
| R-D3 | evaluate | `SUMX(orders, qty * rate)` | `{ "rate": 2, "orders": [{ "qty": 1, "rate": null }] }` | `0` | The key exists with null → blank. It does **not** fall back to root (§6.8 "even when the value is null"). |
| R-D4 | evaluate | `SUMX(orders, SUMX(items, qty * price))` | `{ "orders": [{ "items": [{ "qty": 2, "price": 3 }] }, { "items": [{ "qty": 1, "price": 4 }] }] }` | `10` | Nested iterators, inner scope first |
| R-D5 | evaluate | `SUM(orders.items.qty)` | same as R-D4 | `3` | Flatten one level per list hop |
| R-D6 | filter | `amount > AVERAGEX(all, amount)` | context `{ "all": [{ "amount": 10 }, { "amount": 30 }] }`, rows = same two records | `[1]` | Aggregate over an explicit collection inside a query |
| R-D7 | evaluate | `price` | `{}`, `strict: true` | `#REF!` (or `#NAME?`, see B.1 #13) | |

### C.5 Paths, keys, and records

| ID | Formula | Context | Expected | Rule |
|----|---------|---------|----------|------|
| R-E1 | `customer.address.city` | `{ "customer": { "address": { "city": "Pune" } } }` | `"Pune"` | Path |
| R-E2 | `customer.address.city` | `{ "customer": null }` | blank (`null`) | Path through blank is blank |
| R-E3 | `price.amount` | `{ "price": 5 }` | `#VALUE!` | Path into a scalar |
| R-E4 | `tax.rate` | `{ "tax.rate": 0.2, "tax": { "rate": 0.1 } }` | `0.2` | Exact flat key wins (§6.9) |
| R-E5 | `customer` | `{ "customer": { "name": "A" } }` | `#VALUE!` | A record is not a scalar result |
| R-E6 | `customer & ""` | same | `#VALUE!` | A record is not an operand |
| R-E7 | `q1 * 2` | `{ "q1": 100 }` | **today:** `0` (silently reads cell `Q1`). **Proposed** (`cellReferences: false`): `200` | B.2 #23 |
| R-E8 | `[unit price] * qty` | `{ "unit price": 4, "qty": 2 }` | `8` | Bracket escape (A.6 #3, if adopted) |
| R-E9 | `ACME.TAX(price)` vs `ACME.TAX` | `{ "ACME": { "TAX": 7 }, "price": 1 }` | Call → registry lookup (`#NAME?` if not installed). Bare → `7`. | `(` decides, as for `LOG10` |

### C.6 Corrected Excel-compatibility cases (replace or extend tier-0)

| ID | Formula | Context | Current spec | Correct (Excel) |
|----|---------|---------|--------------|-----------------|
| X-1 | `"3"=3` | `{}` | `TRUE` (fixture `equality-numeric-string`) | `FALSE` |
| X-2 | `"3"<>3` | `{}` | `FALSE` | `TRUE` |
| X-3 | `2^3^2` | `{}` | `512` | `64` |
| X-4 | `1<2<3` | `{}` | `TRUE` (implied) | `FALSE` |
| X-5 | `TRUE>1` | `{}` | `FALSE` (via §8.5 step 3) | `TRUE` |
| X-6 | `"1">2` | `{}` | `FALSE` (via §8.5 step 3) | `TRUE` |
| X-7 | `missing<FALSE` | `{}` | `FALSE` by accident; becomes `TRUE` once X-5 is fixed unless B.1 #5 is fixed too | `FALSE` |
| X-8 | `missing=""` | `{}` | `TRUE` | `TRUE` (unchanged; keep as fixture) |
| X-9 | `0^-1` | `{}` | `#NUM!` | `#DIV/0!` |
| X-10 | `IF(FALSE, 1)` | `{}` | `#VALUE!` (arity) | `FALSE` |
| X-11 | `COUNT(TRUE, "3", 1)` | `{}` | `1` | `3` |
| X-12 | `COUNT(1, 1/0)` | `{}` | `#DIV/0!` | `1` |
| X-13 | `ROUND(2.675, 2)` | `{}` | unspecified (likely `2.67`) | `2.68` |
| X-14 | `0.1+0.2 & ""` | `{}` | `"0.30000000000000004"` | `"0.3"` |
| X-15 | `"10%"*1` | `{}` | `#VALUE!` | `0.1` (or keep `#VALUE!` and list it as a deviation) |

Fixture JSON for many of these cases is in `proposed-fixtures/` next to this file.
