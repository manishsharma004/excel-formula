# Excel formula evaluation on a context object

| Field | Value |
|-------|--------|
| **Status** | Draft — normative proposal for discussion in [issue #4](https://github.com/manishsharma004/excel-formula/issues/4) |
| **Revision** | 0.8.0 |
| **Last updated** | 2026-10-17 |
| **Compatibility target** | Microsoft Excel, **en-US**, for the subset defined here. Quirks we intentionally match are called out. Deliberate deviations are listed in §17.4. Anything not specified is out of scope, not “whatever Excel does.” |

This document is the language-neutral contract for the Python and TypeScript packages (and any later implementation). Implementations MUST cite `specRevision` **0.8.0** when they claim conformance. Behavior marked **Open** or **Proposed** is not yet required.

## 1. Purpose

Evaluate an Excel-style **expression** against an in-memory **context** (a string-keyed mapping) and return a **value**.

Typical call:

```text
evaluate("price * qty", { "price": 9.99, "qty": 3 }) → 29.97
```

Goals:

- Same results in every language for the same fixture.
- No Excel process, workbook file, or UI.
- A documented subset, not the full formula language.

Non-goals for this revision:

- Reading or writing `.xlsx` / `.xls`.
- Recalculating a dependency graph (`evaluate` does not treat context values as formulas).
- Locales other than `en-US` (function names, `.` decimal, `,` argument separator).
- Sheet addresses (`A1`, `A1:B2`, `R1C1`), structured table references, `LAMBDA`, `LET`, and iterative calculation. Lists are values (§6.5). Element-wise arithmetic on lists is required. `filter`, `map`, and `SUMX` stay proposed in §12.5.
- Display formatting (currency, dates-as-text). The evaluator returns data, not formatted text.

## 2. How to read this spec

| Marker | Meaning |
|--------|---------|
| **MUST / MUST NOT** | Required for conformance at this revision |
| **Proposed** | Written precisely enough to argue about (§12.4, §12.5). Not required until issue #4 locks it |
| **Open** | Not decided; do not implement as if it were required |
| **Deferred** | Explicitly out of scope until a later revision |

Decisions are discussed in [issue #4](https://github.com/manishsharma004/excel-formula/issues/4). Change this file in the same PR that claims a decision is locked.

### 2.1 Decisions already recorded

| Topic | Rule |
|-------|------|
| Formula text | Expression only. A leading `=` is **not** part of the API (spreadsheet UI convention). `=price*qty` is a **parse error**, not a stripped prefix. |
| Evaluation mode | **Single-shot.** Context values are data. A string `"price*qty"` in the context is a string, not a nested formula. |
| Locale | `en-US` only. |
| Records and arrays | The context is objects and arrays. There are no cell addresses and no ranges (§6.3). Operators on a list are element-wise (§6.5), so `SUM(values * values)` and `SUM(values * 2)` replace `SUMSQ` and `SUMPRODUCT`. `aggregate` still evaluates `SUM`, `PRODUCT`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, and `COUNTA` once per record (§4.5). `filter`, `map`, and `SUMX` remain **Proposed** (§12.5). |

## 3. Terminology

| Term | Meaning |
|------|---------|
| **Formula** | The expression string passed to `evaluate` |
| **Context** | Mapping from string keys to values (§6) |
| **Name** | An identifier, e.g. `price`, `tax_rate`, `q1`, `A1`. There is no cell-address token |
| **Blank** | The empty value (JSON `null`). Distinct from `0`, `""`, and `FALSE` |
| **Error value** | A spreadsheet error such as `#DIV/0!` (§9). It is a **return value**, not a thrown exception, unless the failure is a host limit or a parse error |
| **Host error** | Parse failure or a limit exceeded. Raised/thrown; not an Excel error value |
| **Direct argument** | A function argument whose value is one scalar: a literal, an operator expression, a function result, or a name (§12.1) |
| **List argument** | A function argument whose value is an array. Membership follows the **in a list** rules of §12.1 |
| **Record**, **List**, **Column** | Nested objects and arrays in the context (§6.7). A column is the list produced by walking a path through a list |
| **Row formula** | A formula that calls no aggregation function. Proposed to be usable as a calculation and as a query (§12.5) |

## 4. Public API

Each language exposes an evaluator constructed with options.

### 4.1 `evaluate(formula, context) → value`

| Input | Rule |
|-------|------|
| `formula` | String. MUST be an expression (§5). MUST NOT require or strip a leading `=`. |
| `context` | String-keyed mapping. Lookup rules in §6. A value may itself be a record or a list; dotted names walk into it (§6.7). Using a record or list where a scalar is required is `#VALUE!`. |
| Result | A value (§7), including an error value (§9), a list, or a record. |

Host errors (§10) abort evaluation and are not returned as `#VALUE!`.

### 4.2 Options

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| `strict` | boolean | `false` | See §6.4 (missing keys) |
| `maxFormulaLength` | integer | `8192` | Measured in UTF-16 code units in every language, the same unit as `LEN` (§12.2) |
| `maxAstNodes` | integer | `4096` | Nodes after parse |
| `maxFunctionArgs` | integer | `255` | Arguments written in one call. One list counts as **one** argument, however many elements it has |
| `maxRangeCells` | integer | `10000` | Maximum elements in one list an operator or aggregate materializes. The name is historical; there are no cell ranges |
| `timeoutMs` | integer or absent | absent | If set, evaluation MUST fail with a host **timeout** error when exceeded. Implementations MAY poll between function calls; they are not required to preempt a single builtin |

Function registry options (`functions`, `builtins`, `clock`) are proposed in §12.4.

`formulaLocale` other than `"en-US"` is **Deferred**. Passing it MUST be a host error (unsupported option), not silent ignore. There is no `referenceStyle`: this revision has no cell references.

### 4.3 What this revision does not provide

- `evaluate_all` / dependency order / circular references. **Deferred.**
- Mutating the context. `evaluate` is pure with respect to the mapping it is given (it MUST NOT insert missing keys).

### 4.4 Language shapes (informative)

```python
ev = Evaluator(strict=False)
ev.evaluate("price * qty", {"price": 9.99, "qty": 3})
```

```ts
const ev = new Evaluator({ strict: false });
ev.evaluate("price * qty", { price: 9.99, qty: 3 });
```

Python and TypeScript names MAY differ in style (`max_formula_length` vs `maxFormulaLength`) but the option meanings MUST match this table.

### 4.5 `aggregate(formula, rows, context?) → value`

`rows` is a list of records. `context` is the root scope and defaults to empty.

`SUM`, `PRODUCT`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, and `COUNTA` evaluate each argument once per record, with that record as the innermost scope (§6.2, §6.7), then apply the **in a list** rules of §12.1. A missing field is blank, so on the records below the first product is `0`.

```text
aggregate("SUM(price * qty)", [{"qty": 3}, {"price": 9.99, "qty": 3}]) → 29.97
```

The same call with `price` `9.99` on both records is `59.94` (`9.99 * 6`). It is not `59.8`. On one object, `SUM(orders.price * orders.qty)` is the element-wise form of that total.

An argument that is already a list or a column is aggregated once, not once per record. `aggregate("SUM(orders.price)", [{}, {}], {"orders": [{"price": 10}, {"price": 5}]})` is `15`.

A formula that calls no aggregation is evaluated once against `context` only. Names on the records are not in scope. Use `map` (§12.5, implemented for the playground) to evaluate a row formula per record.

## 5. Lexical grammar and syntax

Whitespace (U+0009, U+000A, U+000D, U+0020) MAY appear between tokens and MUST NOT appear inside numbers or identifiers. It MUST NOT be required inside strings.

### 5.1 Tokens

| Token | Form |
|-------|------|
| Number | Regex `^([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$`. Examples: `0`, `3.14`, `.5`, `1.`, `1e10`, `1E-3`. A lone `.` is not a number. Leading `+` is not a number token (it is unary plus). Underscores and thousands separators are **not** accepted (`SUM(1,000)` is `SUM(1, 0)`: comma is the argument separator). |
| String | `"…"` with `""` encoding one double-quote. No other escapes. Raw newlines inside strings are allowed (Excel allows them). |
| Boolean | `TRUE` / `FALSE`, case-insensitive |
| Identifier | Dot-separated segments: regex `^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$`. `a..b`, `a.`, and `a.1` are not identifiers. |
| Name | There is no cell-reference token. `A1` and `LOG10` are names. `:` is not an operator, so `A1:B2` is a parse error. |
| Operators | `+` `-` `*` `/` `^` `&` `=` `<>` `<` `>` `<=` `>=` `%` |
| Punctuation | `(` `)` `,` |

Function names use the identifier rule and are matched **case-insensitively** against the function registry (§12.4). `LOG10(100)` is a call because of `(`. Bare `LOG10` is the name. No whitespace is allowed between a function name and its `(`. Unknown calls are `#NAME?` (§9), not host parse errors.

### 5.2 Expression grammar

All binary operators are **left-associative**, including `^`: `2^3^2` is `(2^3)^2` = `64`, as in Excel (not `512` as in mathematics). Precedence from tightest to loosest:

| Precedence | Forms |
|------------|--------|
| 1 | Unary `+` and unary `-` |
| 2 | Postfix `%` |
| 3 | `^` |
| 4 | `*` `/` |
| 5 | `+` `-` |
| 6 | `&` |
| 7 | `=` `<>` `<` `>` `<=` `>=` |

```text
expr        := comparison
comparison  := concat ( comp_op concat )*
concat      := additive ( "&" additive )*
additive    := multiplicative ( ( "+" | "-" ) multiplicative )*
multiplicative := power ( ( "*" | "/" ) power )*
power       := percent ( "^" percent )*
percent     := unary "%"*
unary       := ( "+" | "-" ) unary | primary
primary     := number | string | boolean | name | function_call | "(" expr ")"
function_call := ident "(" [ expr ( "," expr )* ] ")"
name        := identifier
```

An argument slot MUST NOT be empty. `IF(a,,b)` and `ROUND(x,)` are host parse errors in this revision (Excel accepts them; **Deferred**). Fewer arguments, as in `LEFT(text)`, are allowed where a function says so.

Comparisons chain as in Excel: `1<2<3` is `(1<2)<3` → `TRUE<3`. Ordered comparison does not convert booleans to numbers, and a boolean sorts after every number (§8.5), so the result is `FALSE`.

`:` is not an operator. `A1:A2` is a host parse error. Whitespace is never an operator.

### 5.3 Percent and exponent

`10%` means `10 * 0.01` → `0.1`.

Because unary minus binds tighter than `%`, and `%` binds tighter than `^`:

| Formula | Parse | Result |
|---------|--------|--------|
| `10%` | `(10)%` | `0.1` |
| `-10%` | `((-10))%` | `-0.1` |
| `10%^2` | `(10%)^2` | `0.01` |
| `-2^2` | `(-2)^2` | `4` |
| `2^3^2` | `(2^3)^2` | `64` |

`-2^2` → `4` matches Excel (unary minus is tighter than `^`), not the usual math reading `-(2^2)`. `2^3^2` → `64` matches Excel’s left-to-right `^`.

### 5.4 Leading `=`

The first non-whitespace character MUST NOT be `=`. The string `=1+1` is a **parse error** (host). Equality is the infix operator: `1=1`.

## 6. Context and references

### 6.1 Mapping

The context is one string → value map. Values may be scalars or nested records and lists (§6.7). Keys are names, including keys that look like cells:

```json
{ "price": 9.99, "qty": 3, "q1": 100 }
```

`price * qty` and `q1 * 2` are both names. There is no sheet.

### 6.2 Name lookup

- Names are **case-sensitive**. `price` and `Price` are different keys.
- The identifier in the formula is used as the key with its exact spelling.
- `.` is allowed (`tax.rate`, `nested.price`). An exact key, including the dots, always wins. If that key does not exist, the name is a path (§6.7).
- A key that is not an identifier (contains a space or `-`, starts with a digit) cannot be written in this revision. A key shaped like a cell (`q1`, `vat20`, `A1`) is still a **name**.

### 6.3 No spreadsheet ranges

This library evaluates formulas on objects and arrays. It has no sheet, no `A1` address, and no `A1:B2` range. A token is a name or a function call. `SUM(values)` reads the array stored at `values`. `SUM(orders.price * orders.qty)` multiplies those two arrays element by element, then sums. `SUM(orders.price * 2)` multiplies every element by `2`. `SUM(orders.price * orders.price)` is the sum of squares. `SUMSQ` and `SUMPRODUCT` are not functions.

### 6.4 Missing keys

| `strict` | Missing name |
|----------|----------------------|
| `false` (default) | **Blank** |
| `true` | Error value `#REF!` |

Blank then follows coercion (§8). So with `strict: false`, `missing + 1` is `1`. With `strict: true`, it is `#REF!`.

### 6.5 Lists

An array in the context is a list. Operators are element-wise when either operand is a list. A list and a scalar pair each element with that scalar. Two lists pair by index and MUST have the same length, or the result is `#VALUE!`. If a paired element is itself a list, the same rule applies to that element. A list longer than `maxRangeCells` is a host error **limit**. The result of an element-wise operation is a list. `SUM`, `PRODUCT`, and the other aggregates then read that list with the **in a list** rules of §12.1 (the same membership Excel uses inside a range). A list of records passed to `SUM` is `#VALUE!`. Text in an element-wise product is not skipped: `"n/a" * 4` is `#VALUE!`, and `SUM` of a list that contains that error returns the error.

### 6.6 Context values that look like formulas

`"price*qty"` stored in the context is a **string**. It is not parsed. Single-shot evaluation only walks the formula argument.

### 6.7 Nested records and lists

A context value MAY be a **record** (JSON object that is not a `$type` wrapper) or a **list** (JSON array), at any depth.

A dotted name is resolved as follows:

1. Look up the whole name as an exact key in the current scope (§12.5.2 when a row scope is pushed; otherwise the context). If the key exists, even when its value is null, that value is the result. Do not walk the path.
2. Otherwise split the name on `.`. Resolve the first segment as a name. Each later segment is one step:
   - On a **record**, look up that key. A missing key follows §6.4.
   - On a **list**, apply the same step to every element, in order. If an element’s step returns a list, splice that list in (one level). The result is a **column**.
   - On blank, the step is blank.
   - On any other scalar, the step is `#VALUE!`.
   - An error stays that error.

`price * qty * nested.price` with `nested` equal to `{"price": 10}` reads `nested`’s `price`. `tax.rate` is `0.2` when the context has both `"tax.rate": 0.2` and `"tax": {"rate": 0.1}`.

A record used as a scalar operand is `#VALUE!`. A list used with `+`, `-`, `*`, `/`, `^`, `%`, or `&` is element-wise (§6.5). `orders.price * 2` is a list. `SUM(orders.price * orders.price)` is the sum of squares.

`SUM`, `PRODUCT`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `AND`, `OR`, and `CONCAT` accept a list of scalars with the **in a list** rules of §12.1. Text and booleans are skipped by `SUM` and `PRODUCT`. A list of records, such as `SUM(orders)`, is `#VALUE!`.

## 7. Value model

### 7.1 Runtime types

| Type | Definition |
|------|------------|
| Number | IEEE-754 binary64. NaN and infinities MUST NOT be produced; operations that would produce them become `#NUM!` or `#DIV/0!` as specified per operator. |
| String | Unicode scalar values. No implicit NFKC normalization. |
| Boolean | `TRUE` or `FALSE` |
| Blank | Empty. Exactly one blank value. |
| Error | One of the codes in §9. Carries no extra payload in this revision. |

No date type is returned. A list produced by an element-wise operator is a result: `evaluate("values * 2", {"values": [10, 5]})` is `[20, 10]`. A record used where a scalar is required is `#VALUE!`. A formula whose whole result is a record returns that record.

### 7.2 JSON encoding (fixtures and host interop)

| Runtime | JSON |
|---------|------|
| Number | JSON number. Fixtures that need exact binary64 edge cases MAY use `{"$type":"number","value":"<decimal>"}` |
| String | JSON string |
| Boolean | `true` / `false` |
| Blank | `null` |
| Error | `{"$type":"error","code":"#DIV/0!"}` |
| List | JSON array |
| Record | JSON object that is not a `$type` wrapper |

Context keys are JSON strings. Context values use the same encoding. A JSON object that is not a `$type` wrapper is a record. A JSON array is a list. Both are read by §6.7 and are `#VALUE!` wherever a scalar is required. As the whole result of `evaluate`, a list or a record is returned (§7.1).

The key `$type` is **reserved** for wrappers. Hosts SHOULD reject, at the API boundary, a JSON object whose `$type` value is not a wrapper type defined by this spec. Proposed escape for real data that has a `$type` field: `{"$type":"record","value":{…}}` (§12.5).

### 7.3 Dates

**Deferred.** No serial-date type, no `DATE` / `TODAY` / `NOW`. Numeric values are not interpreted as dates. This stays **Open** on issue #4 until a revision adds them.

## 8. Coercion

When an operator or function requires a type, apply the conversions below. If conversion fails, the result is `#VALUE!` unless a function specifies a different error.

### 8.1 To number

| From | Result |
|------|--------|
| Number | Itself |
| Boolean | `TRUE` → `1`, `FALSE` → `0` |
| Blank | `0` |
| String | Trimmed (leading/trailing U+0020 only). If the remainder matches a number token, that number; else failure. `"1e2"` → `100`. `"10%"` does **not** parse as a number (percent is syntax, not a string format). Excel also converts `"10%"`, `"$1,000"`, and date text; not doing so is a deliberate deviation (§17.4). |
| Error | The same error (does not become `#VALUE!`) |

### 8.2 To string (for `&` and text functions)

| From | Result |
|------|--------|
| String | Itself |
| Blank | `""` |
| Boolean | `TRUE` or `FALSE` (uppercase) |
| Number | Decimal rendering: sign if negative, no leading `+`, no thousands separator, `.` radix, enough digits to round-trip binary64 (implementations SHOULD use the same algorithm as the shortest round-trip, e.g. Dragon4 / Ryū). Integers in the safe range render without a decimal point. **Open:** Excel’s General format uses at most 15 significant digits (`0.1+0.2 & ""` is `"0.3"` in Excel, `"0.30000000000000004"` under this rule) and switches to exponent form for large values. |
| Error | The same error |

### 8.3 To boolean (conditions: `IF`, `AND`, `OR`, `NOT`)

| From | Result |
|------|--------|
| Boolean | Itself |
| Number | `0` → `FALSE`, any other finite number → `TRUE` |
| Blank | `FALSE` |
| String | Failure (`#VALUE!`), including `"TRUE"` |
| Error | The same error |

### 8.4 Equality (`=` and `<>`)

Comparison operators **never coerce** between types. This differs from arithmetic: `"3"+1` is `4`, but `"3"=3` is `FALSE`. Excel behaves the same way.

Compare with this rule (first match wins):

1. If either side is an error, return that error (left, then right).
2. If either side is blank, replace the blank with the **empty value of the other side’s type**: `0` against a number, `""` against a string, `FALSE` against a boolean. Blank equals blank. So blank equals `0`, `FALSE`, and `""`.
3. If both sides are strings, compare case-**insensitively** (simple case fold of A–Z only; no locale).
4. If both sides are booleans, compare identity.
5. If both sides are numbers, compare numeric equality (`-0` equals `0`).
6. Otherwise the types differ: `FALSE` for `=`, and `TRUE` for `<>`. `"3"=3` is `FALSE`, `TRUE=1` is `FALSE`. There is no `#VALUE!` for unlike types.

**Open:** numbers are compared as exact binary64, so `0.1+0.2=0.3` is `FALSE`. Desktop Excel can report `TRUE` for near-equal results. Whether to compare at 15 significant digits is on issue #4.

### 8.5 Ordered comparisons (`<`, `>`, `<=`, `>=`)

1. Errors propagate (left, then right).
2. Blank is replaced as in §8.4 step 2, by the other side’s type: `0`, `""`, or `FALSE`. Blank compared with blank is equal.
3. If both sides are numbers, compare numerically.
4. If both sides are strings, compare case-insensitively (A–Z fold), then by UTF-16 code unit.
5. If both sides are booleans, `FALSE` < `TRUE`.
6. Otherwise the types differ, and the order is by type alone: **number < string < boolean**. No value is converted.

Examples: `"3">2` is `TRUE` and `"1">2` is also `TRUE` (any string is greater than any number). `TRUE>1` is `TRUE`. `missing<FALSE` is `FALSE` (blank becomes `FALSE`). `missing<"a"` is `TRUE` (blank becomes `""`).

## 9. Error values

| Code | When |
|------|------|
| `#DIV/0!` | Division by zero, `0` raised to a negative power, or `AVERAGE` of an empty numeric set |
| `#VALUE!` | Type mismatch / failed coercion, wrong arity |
| `#REF!` | Cell address out of bounds (§6.3), or missing key when `strict` is true |
| `#NAME?` | Unknown function name. A missing **name** is not `#NAME?`; it follows §6.4. (Excel returns `#NAME?` for an undefined name; using `#REF!` in strict mode is a deliberate deviation, §17.4) |
| `#NUM!` | Numeric domain error (`^` with a negative base and a non-integer exponent, `0^0`, overflow to non-finite) |
| `#N/A` | Reserved for future lookup functions. Not produced by Tier 0 |
| `#NULL!` | Reserved (intersection). Not produced in this revision |
| `#GETTING_DATA` and others | Out of scope |

If several errors could apply, return the error produced first in evaluation order (§11): for operators, the left operand before the right; for functions, the first argument, in order, that yields an error and is not ignored by that function’s rules.

`IFERROR` (Tier 1, §12.2) is the only Tier 0/1 function that swallows error values. Arithmetic does not.

## 10. Host errors

These are **not** formula results. APIs MUST surface them as thrown exceptions / rejected results distinct from error values:

| Kind | When |
|------|------|
| `parse` | The formula is not a valid expression, including a leading `=` |
| `limit` | Formula length, AST size, argument count, or list size exceeded |
| `timeout` | `timeoutMs` exceeded |
| `unsupported` | Unsupported option |
| `config` | Invalid function registration (§12.4, Proposed) |
| `function` | A custom function threw or returned a non-value (§12.4.5, Proposed) |
| `row` | A row in `filter` produced an error value or a non-boolean, and `onRowError` is `"raise"` (§12.5.4, Proposed). Carries the row index and the error code |

Messages are implementation-defined. Fixture files do not assert message text.

## 11. Evaluation order

- Subexpressions evaluate **left to right** after the parse tree is built.
- Function arguments evaluate left to right **before** the call, except `IF` and `IFERROR` (§12), which MUST NOT evaluate the unused branch.
- `AND` / `OR` MUST evaluate every argument (Excel does not short-circuit). An error in a later argument is visible even if an earlier argument is already decisive.
- Unary and binary operators evaluate their operands fully, then apply §8.

## 12. Functions

Function names are case-insensitive. Wrong arity is `#VALUE!` (Excel often uses `#VALUE!` for wrong argument counts on these functions).

A list argument is read in element order, then the function’s per-value rules run.

**Direct arguments and lists.** The rules below distinguish a **direct** scalar from a value **in a list**. `SUM(flag)` with `flag` = `TRUE` is `1`, the same as `SUM(TRUE)`. `SUM(flags)` when `flags` is `[true, 1]` is `1`, because a boolean inside a list is ignored. There is no cell reference, so the old question of whether `SUM(A1)` follows range rules does not arise. `A1` is a name.

### 12.1 Tier 0 (required for conformance)

#### `IF(condition, if_true[, if_false])`

- 2 or 3 arguments.
- Evaluate `condition` only. Convert with §8.3.
- If that yields `TRUE`, evaluate and return `if_true` only.
- If `FALSE`, evaluate and return `if_false` only. With 2 arguments, return `FALSE` (Excel): `IF(FALSE, 1)` is `FALSE`.
- If the condition is an error, return it and evaluate neither branch.

#### `AND(arg1, …)` / `OR(arg1, …)`

- At least one argument.
- Each scalar is converted with §8.3.
- Inside a list, **non-numeric text is ignored**, blanks are ignored, numbers and booleans count. If a list contributes **zero** scalars and there is no other scalar argument, the result is `#VALUE!`.
- `AND` is `TRUE` iff every counted scalar is `TRUE`.
- `OR` is `TRUE` iff any counted scalar is `TRUE`.
- Direct arguments that fail §8.3 produce `#VALUE!` (they are not ignored).

#### `NOT(arg)`

- Exactly one argument, which MUST be scalar (a list is `#VALUE!`).
- Convert with §8.3 and negate.

#### `SUM(arg1, …)`

- At least one argument.
- Numbers are added.
- Booleans: in a **list**, ignored; as a **direct** argument, coerced to 1/0 (Excel).
- Blanks ignored.
- Text in a **list**: ignored. Text as a **direct** argument: coerce with §8.1 or `#VALUE!`.
- Errors anywhere in the considered values propagate.

#### `AVERAGE(arg1, …)`

- Same membership rules as `SUM` for which values count as numbers.
- Result is the arithmetic mean.
- If zero numbers were counted, `#DIV/0!`.

#### `MIN(arg1, …)` / `MAX(arg1, …)`

- Same membership as `SUM`.
- If zero numbers were counted, result is `0` (Excel).

#### `COUNT(arg1, …)`

- In a **list**: only numbers count. Booleans, text, blanks, and errors are skipped.
- **Direct** arguments: a number counts; a boolean counts; text counts if it converts to a number under §8.1 (`"3"` counts, `"abc"` does not); blank does not count.
- Errors never propagate, direct or in a list. They are not counted. `COUNT(1, 1/0)` is `1`. This is Excel `COUNT`.
- Example: `COUNT(TRUE, "3", 1)` is `3`.

#### `COUNTA(arg1, …)`

- Counts non-blank values.
- Numbers, text, booleans, and errors all count. Errors do **not** propagate; each error counts as one (Excel `COUNTA`).
- Blanks do not count.
- A direct empty string `""` counts (it is text, not blank).

#### `PRODUCT(arg1, …)`

- At least one argument.
- Same membership as `SUM`: numbers are multiplied; blanks are ignored; booleans and text in a list are ignored; a direct boolean is `1` or `0`; direct numeric text is coerced; other direct text is `#VALUE!`.
- Errors propagate.
- If no number was counted, the result is `0` (Excel), not `1`.

`SUM(list * list)` is the sum of pairwise products. `SUM(list * list)` with both lists equal to the same numbers is the sum of squares. `SUM(list * number)` multiplies every element by that number and then sums. There is no `SUMSQ` or `SUMPRODUCT`.

`SUMIF`, `COUNTIF`, `AVERAGEIF`, and their `IFS` forms stay **Deferred** in Tier 2. They need a criteria language this revision does not define.

### 12.2 Tier 1 (specified, not required for a “Tier 0 only” build)

Implementations that advertise Tier 1 MUST implement all of the following.

#### `IFERROR(value, if_error)`

- Evaluate `value`.
- If it is an error value, evaluate and return `if_error`.
- Otherwise return `value` and do not evaluate `if_error`.

#### `IFNA(value, if_na)`

- Same, but only `#N/A` is replaced. Other errors propagate.

#### Text

| Function | Behavior |
|----------|----------|
| `LEN(text)` | Code **units** of §8.2 string (UTF-16 code units if the host is JS; Python implementations MUST count UTF-16 code units as well, not Unicode code points, so `LEN` matches across languages). |
| `LEFT(text, n)` / `RIGHT(text, n)` | `n` converted to number then truncated toward 0. Negative `n` → `#VALUE!`. `n` omitted means `1`. Result is a string of that many UTF-16 code units, or the whole string if shorter. |
| `MID(text, start, n)` | `start` is 1-based. `start < 1` → `#VALUE!`. Same `n` rules as `LEFT`. |
| `CONCAT(arg1, …)` | At least one argument. Each scalar converted with §8.2 and appended. Lists: each element converted with §8.2; blank becomes `""`. Errors propagate. |

`CONCATENATE` is an alias of `CONCAT` (same arity rules: one or more arguments).

#### Rounding

| Function | Behavior |
|----------|----------|
| `ROUND(number, digits)` | `digits` truncated toward 0. Round half **away from zero**. `digits` may be negative (round to tens, hundreds, …). Rounding is decided on the **decimal** value of `number` rounded to 15 significant digits, not on its binary64 residue: `ROUND(2.675, 2)` is `2.68` (binary64 stores `2.67499999…`), as in Excel. |
| `ROUNDUP` / `ROUNDDOWN` | Away from / toward zero at the given decimal place, using the same 15-significant-digit decimal value as `ROUND`. |
| `INT(number)` | Floor toward `-∞`. |
| `TRUNC(number, digits?)` | Toward zero. `digits` defaults to `0`. |

### 12.3 Tier 2 and Tier 3

**Deferred** (catalog only, no required semantics yet):

- Tier 2: `VLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`, `SUMIF`, `COUNTIF`, `DATE`, `TODAY`, `NOW`
- Tier 3: dynamic arrays, `LAMBDA`, `LET`, `SORT`

`FILTER` is not in the Tier 3 list. The name is proposed for the record function in §12.5.5, which takes a row formula rather than Excel’s boolean array. If the spec ever adds Excel’s array `FILTER`, it will need a different name, or a rule that tells the two forms apart.

### 12.4 Extensibility: additional functions (Proposed)

**Status: Proposed, under discussion on [issue #4](https://github.com/manishsharma004/excel-formula/issues/4).** Nothing here is required for Tier 0 conformance until the issue locks it. It is written with MUST/SHOULD so the proposal is precise enough to argue about.

Callers will want functions the spec does not define: domain rules (`TAX(amount, region)`), Excel functions from a later tier before the spec reaches them, or company-specific helpers. There are two kinds of growth, and they need different rules:

| Kind | Who adds it | Same result in every language? | Covered by shared fixtures? |
|------|-------------|--------------------------------|-----------------------------|
| **Spec functions** (Tier 1, Tier 2, …) | This spec, in a new revision | Yes, MUST | Yes, `spec/fixtures/tier*/` |
| **Custom functions** | The application, at runtime | Only if the application writes both versions | Only if a function pack ships its own fixtures (§12.4.9) |

#### 12.4.1 One registry for everything

Each evaluator holds a **function registry**: a case-insensitive map from function name to an implementation plus a signature (§12.4.3). Builtins are registered through the same mechanism as custom functions.

That is a design constraint, not a convenience. If the Tier 0 builtins can be written with the public extension API, the API is proven expressive enough for real Excel functions (lazy `IF`, list-aware `SUM`). If builtins need private hooks, custom functions will hit the same wall.

Lookup happens when a call is **evaluated**, not when it is parsed. A call to a name that is not in the registry still returns `#NAME?` (§9), so formulas that mention a not-yet-installed function parse and fail gracefully.

#### 12.4.2 Configuring the registry

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| `functions` | list of function definitions | `[]` | Custom functions added on top of the builtins |
| `builtins` | `"all"`, a tier list such as `["0"]`, or an explicit name list | `"all"` | Which builtins are available. Lets a server expose only a reviewed subset to untrusted formulas |

Rules:

- A custom name that collides with an enabled builtin is a host error **`config`** at construction time, unless the definition sets `override: true`. Overriding is allowed so an application can patch a builtin, but never by accident.
- Two custom definitions with the same name (case-insensitive) are a host error **`config`**.
- The registry is fixed once the evaluator is constructed. Registering after construction is not supported, so one evaluator gives the same answer for the same input for its whole lifetime, and it is safe to share across threads or requests.
- Removing a builtin is done through `builtins`, not by registering a stub.

#### 12.4.3 Function names

- Names follow the identifier rule in §5.1 (`[A-Za-z_][A-Za-z0-9_.]*`) and are matched case-insensitively, like builtins.
- A name MAY look like a spreadsheet address. `LOG10` is a name and also a real Excel function. The `(` decides (§5.1): `LOG10(100)` is a call, bare `LOG10` is the name.
- Custom functions SHOULD use a dotted namespace, for example `ACME.TAX`. Names without a dot are reserved for current and future spec functions. A future spec revision that adds a builtin with the same name as an un-namespaced custom function would otherwise collide, and §12.4.2 makes that a construction-time error after an upgrade.
- `TRUE` and `FALSE` cannot be registered.

#### 12.4.4 Signature

A definition is:

| Field | Meaning |
|-------|---------|
| `name` | §12.4.3 |
| `minArgs`, `maxArgs` | Arity. `maxArgs` may be unbounded (still capped by `maxFunctionArgs`, §4.2). Wrong arity is `#VALUE!` without calling the implementation. |
| `params` | Per-parameter kind (below). The last entry repeats for variadic functions. |
| `impl` | The function body (§12.4.5) |
| `override` | §12.4.2 |
| `volatile` | Default `false`. §12.4.7 |

Parameter kinds decide **what the implementation receives**. The evaluator does the work, so every function treats lists, errors, and laziness the same way. There is no rectangle parameter: this revision has no ranges.

| Kind | The implementation receives | Errors | Typical use |
|------|-----------------------------|--------|-------------|
| `number` | A number, coerced with §8.1 | An error argument short-circuits: the function is not called, the error is returned | `ROUND`, `ACME.TAX` |
| `string` | A string, coerced with §8.2 | Same | `LEFT`, `LEN` |
| `boolean` | A boolean, coerced with §8.3 | Same | `NOT` |
| `scalar` | Any scalar value, uncoerced, including blank and error values | Passed through; the function decides | `IFERROR`, `ISBLANK` |
| `values` | A flat list in §6.5 order. Each item is tagged **direct** or **in a list**, because those membership rules differ (§12.1 `SUM`) | Passed through | `SUM`, `COUNT`, `CONCAT` |
| `lazy` | A thunk. The argument is evaluated only if and when the implementation calls it, at most once | Whatever the thunk returns | `IF`, `IFERROR`, `CHOOSE` |
| `list` (Proposed, §12.5) | A list of records or scalars, or a column. A scalar argument is `#VALUE!` | Passed through | `COUNTROWS`, `SUMX` |
| `perRow` (Proposed, §12.5) | A function of one record: each call evaluates the argument with that record pushed as the innermost scope (§12.5.2). It may be called any number of times | Whatever each call returns | `SUMX`, `FILTER` |

A list passed to a `number`, `string`, `boolean`, or `scalar` parameter is `#VALUE!`.

#### 12.4.5 Implementation contract

- The implementation receives the converted arguments and a small **call context**: the evaluator options, a clock (§12.4.7), and a `checkTimeout()` hook.
- It MUST return a value from §7.1. It returns spreadsheet errors as error **values** (the language binding provides a constructor, for example `ExcelError("#N/A")`). It does not throw them.
- Returning a list or a record is allowed (§7.1). Returning anything else (`NaN`, `undefined`, a date object) is a host error **`function`**.
- An exception thrown by the implementation is a host error **`function`** that names the function and carries the original exception. It is **not** turned into `#VALUE!`. A bug in application code should be loud; `#VALUE!` would make it look like bad input data.
- The context mapping is not passed in. A custom function sees only its arguments, so `evaluate` stays pure with respect to the context (§4.3) and a function cannot quietly read keys the formula never mentioned.
- Implementations MUST be synchronous. Async functions (database lookups, HTTP) are **Deferred**: they would make the API async in both languages and make timeouts and determinism much harder. Fetch the data first and put it in the context.

#### 12.4.6 Language shapes (informative)

```python
from excel_formula import Evaluator, FunctionDef, ExcelError

def tax(amount: float, rate: float):
    if rate < 0:
        return ExcelError("#NUM!")
    return amount * rate

ev = Evaluator(functions=[
    FunctionDef(name="ACME.TAX", params=["number", "number"], impl=tax),
])
ev.evaluate("ACME.TAX(price, 0.2)", {"price": 100})  # 20
```

```ts
import { Evaluator, excelError } from "@excel-formula/core";

const ev = new Evaluator({
  functions: [{
    name: "ACME.TAX",
    params: ["number", "number"],
    impl: (amount: number, rate: number) =>
      rate < 0 ? excelError("#NUM!") : amount * rate,
  }],
});
ev.evaluate("ACME.TAX(price, 0.2)", { price: 100 }); // 20
```

The Python keyword and TypeScript property names MAY differ in style, but field meanings MUST match §12.4.4.

#### 12.4.7 Volatile functions and the clock

`TODAY()`, `NOW()`, and `RAND()` give different answers on each call. They break fixtures and caching.

- A definition marked `volatile: true` MUST read time through the call context clock, not the system clock.
- The evaluator option `clock` (a function returning the current instant) defaults to the system clock. Tests inject a fixed clock.
- Randomness gets the same treatment through an injectable `random` source. Until a revision adds `RAND`, this is only reserved.
- Callers that cache results MUST NOT cache a formula that called a volatile function. The evaluator reports this: `evaluate` exposes, alongside the result, whether any volatile function ran (exact shape **Open**; a second method such as `evaluateDetailed` is one option).

#### 12.4.8 Discovering what is available

`listFunctions()` returns every enabled function with its name, arity, parameter kinds, tier (or `custom`), and whether it is volatile. Uses:

- Autocomplete and validation in formula editors.
- A server checking a stored formula against the functions it actually allows, before running it.
- `parse(formula)` that returns the referenced function names and context keys without evaluating (**Open**). It lets a UI warn "this formula calls `ACME.TAX`, which is not installed here" at save time instead of at run time.

#### 12.4.9 Function packs and cross-language parity

A **function pack** is a named, versioned set of definitions published for more than one language, for example `acme-finance`. Parity is the whole point of this repository, so packs follow the same rules as the spec:

- A pack ships fixtures in the §15.2 format under its own directory, plus a manifest naming the pack and its version.
- A fixture may set `"packs": ["acme-finance@1"]`. Runners load those packs before evaluating, and skip the fixture when a pack is not available for that language.
- Spec tiers are themselves packs maintained in this repository (`tier0`, `tier1`, …). Promoting a well-used pack function into a spec tier is how the builtin catalog grows.

#### 12.4.10 Security

Custom functions run application code with the application's privileges. The evaluator cannot sandbox them, so the controls are about **which** functions untrusted formulas can reach:

- `builtins` restricts the built-in surface. For example `["0"]` allows only reviewed Tier 0 functions.
- The application chooses which custom functions to register. A function that reads files or the network should not be registered on an evaluator that runs user-authored formulas.
- `timeoutMs` (§4.2) still applies. A long-running custom function SHOULD call `checkTimeout()` inside loops; otherwise the timeout fires only after it returns.
- List arguments are materialized under `maxRangeCells`, so a custom function cannot be used to bypass that limit.

#### 12.4.11 Open questions for issue #4

1. Should a custom function that throws produce a host error **`function`** (proposed) or `#VALUE!` like Excel add-ins often do?
2. Is the dotted-namespace rule a MUST, or only a SHOULD with a warning on upgrade collisions?
3. Should `override: true` of a builtin be allowed at all, or only replacing a builtin via `builtins` plus a new name?
4. Do we need `lazy` parameters for custom functions, or only for builtins? (`lazy` is required to write `IF` with the public API.)
5. How should `evaluate` report that a volatile function ran: a separate method, an options flag, or a result wrapper?
6. Do we ever allow async functions, or keep "fetch first, then evaluate" as a permanent rule?
7. Should `LAMBDA` / `LET` (Tier 3) be how users define functions *in formula text*, as a second, sandboxed extension route that needs no host code?

### 12.5 Records, lists, and query mode (Proposed, “Tier R”)

**Status: Proposed, except where an earlier section already requires the rule.** Dotted paths and columns are required by §6.7. Summing a row expression over a list of records is required by `aggregate` (§4.5), not by `SUMX`. What remains proposed here is `filter`, `map`, `compile`, and the `SUMX` / `FILTER` functions. Draft fixtures for those are in [`spec/fixtures/proposed/records/`](fixtures/proposed/records/). The reasoning is in [`spec/REVIEW.md`](REVIEW.md) Part A.

#### 12.5.1 Records, lists, columns, and paths

- A context value MAY be a **record** (JSON object) or a **list** (JSON array), at any depth. Both are non-scalar.
- Path walking is required by §6.7, including the exact-key-wins rule. The bullets below restate it for the row functions in this section.
- A segment applied to a **list** applies the rest of the path to every element. The result is a **column**: a list of values in element order. A list reached inside a list is flattened one level per hop, so `orders.items.qty` is every item’s `qty` across all orders.
- A segment applied to blank yields blank. A segment applied to any other scalar yields `#VALUE!`. A missing key follows §6.4.
- Operators on lists are element-wise (§6.5). `orders.price * 2` is a list. `SUM(orders.price * orders.qty)` sums the pairwise products when every product is a number. A record used as a scalar operand is `#VALUE!`. A list or a record may be the result of `evaluate` (§7.1).

#### 12.5.2 Scope

Evaluation keeps a stack of scopes. The root scope is the context. `filter` and `map` (§12.5.4), and each row of a row-scoped function (§12.5.5), push the current record.

A bare name, or the first segment of a path, resolves in the innermost scope **whose record contains that key, even when the value is null**. If no scope contains the key, §6.4 applies. So in `filter("amount > threshold", rows, {threshold: 100})`, `amount` comes from the row and `threshold` from the root. A row with `"rate": null` gets blank for `rate`; a row with no `rate` key falls back to an outer `rate`.

#### 12.5.3 Aggregations over lists and columns

Every Tier 0 and Tier 1 aggregate (`SUM`, `PRODUCT`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `AND`, `OR`, `CONCAT`) accepts a list of scalars, with the **in a list** rules of §12.1. Text and booleans are skipped by `SUM` and `PRODUCT`. A list of **records** passed to these functions is `#VALUE!` (`SUM(orders)`).

#### 12.5.4 API: one row formula, three uses

```text
evaluate(formula, context)       → value            # calculation on one record
filter(formula, rows, context?)  → rows             # query: rows whose result is TRUE
map(formula, rows, context?)     → list of values   # calculated column
compile(formula)                 → program          # parse once; program.evaluate / filter / map
```

- `rows` is a list of records. Each record becomes the row scope; `context` (default empty) is the root scope.
- `filter` converts each result with §8.3. `TRUE` keeps the row; `FALSE`, `0`, and blank drop it. A result that is an error value, or a string, is a **row failure**.
- Option `onRowError`: `"raise"` (default) throws host error **`row`** (§10) with the row index and error code; `"exclude"` drops the row.
- `filter` returns the input records themselves, in input order.
- `map` returns one value per row, in order. An error value stays in its slot; `onRowError` does not apply.
- Option `maxRows` (default `10000`) bounds `rows` and every list a row-scoped function walks. A larger list is host error **`limit`**. `timeoutMs` MUST be polled at least between rows.
- There is no `cellReferences` option. `q1` and `A1` are names (§6.2).

#### 12.5.5 Row-scoped functions

Each takes a list of records and a **row formula** that is evaluated once per record, with that record pushed as a scope. In §12.4.4 terms the list is a `list` parameter and the row formula a `perRow` parameter. (`lazy` is not enough: it runs at most once.) An element of the list that is not a record is `#VALUE!` for that row.

| Function | Result | Empty list |
|----------|--------|-----------:|
| `COUNTROWS(list)` | Number of elements | `0` |
| `FILTER(list, predicate)` | The records whose predicate is `TRUE` under §8.3, as a list. An error from any predicate is the result | empty list |
| `SUMX(list, expr)` | `SUM` of the per-row results | `0` |
| `AVERAGEX(list, expr)` | `AVERAGE` of the per-row results | `#DIV/0!` |
| `MINX(list, expr)` / `MAXX(list, expr)` | `MIN` / `MAX` of the per-row results | `0` |
| `COUNTX(list, expr)` | `COUNT` of the per-row results | `0` |
| `COUNTAX(list, expr)` | `COUNTA` of the per-row results | `0` |

**Invariant.** The per-row results form a column, and the aggregate applies its **in a list** rules (§12.1) to that column. Therefore `SUMX(orders, price)` equals `SUM(orders.price)`. An error in a per-row result propagates through `SUMX`, `AVERAGEX`, `MINX`, and `MAXX`, and is skipped by `COUNTX` and counted by `COUNTAX`.

`SUM(orders, price*qty)` is not a substitute. `SUM(a, b)` already means `a + b`, and whether `price*qty` runs once or per row cannot depend on the runtime type of `orders`. The required form is `aggregate("SUM(price * qty)", orders)` (§4.5): the row list is an argument of the API, and each aggregate argument is then evaluated per record.

#### 12.5.6 Fixtures

Proposed fixtures add `"mode": "evaluate" | "filter" | "map"` (default `evaluate`), `"rows"`, and `options.onRowError`. For `filter`, `expected` is the list of **0-based indexes** of kept rows.

#### 12.5.7 Open questions for issue #4

1. Per-row fallback to an outer scope (§12.5.2) versus an explicit qualifier such as `ROOT.rate`.
2. Whether `strict` also covers missing **fields** in records, or only top-level names.
3. A syntax for keys that are not identifiers, for example `[unit price]`.
4. Grouping (`groupBy(keyFormula, aggregateFormula, rows)`).

Decided in 0.8.0, and no longer open: there is no `cellReferences` option (`q1` is a name), and element-wise arithmetic on lists is required (§6.5).

## 13. Operators (after coercion)

| Operator | Rule |
|----------|------|
| `+` `-` `*` | Numeric coercion of both sides, then IEEE operation. Non-finite result → `#NUM!`. If either operand is a list, pair by §6.5 first, then apply this rule to each pair. The same lifting applies to `/`, `^`, `&`, comparisons, unary `+`/`-`, and `%`. |
| `/` | Numeric coercion. Divisor `0` or `-0` → `#DIV/0!`. |
| `^` | Numeric coercion. Left-associative (§5.2). If base `< 0` and exponent is not an integer, `#NUM!`. `0^0` → `#NUM!` (Excel). Base `0` with a negative exponent → `#DIV/0!` (Excel): `0^-1` is `#DIV/0!`. Any other non-finite result → `#NUM!`. |
| Unary `+` | Numeric coercion. |
| Unary `-` | Numeric coercion, then negate. |
| `%` | Numeric coercion, then multiply by `0.01`. |
| `&` | String coercion of both sides, then concatenate. |
| Comparisons | §8.4 and §8.5. Result is boolean. |

## 14. Limits and safety

Defaults are in §4.2. They exist so a server can evaluate untrusted formulas.

- Formula text cannot define functions, and there is no recursion through the context, so call depth is the nesting depth of the formula. Exceeding `maxAstNodes` covers that. Custom functions (§12.4, Proposed) run host code; the limits here still apply to their arguments.
- Implementations MUST NOT fetch network resources, read the filesystem, or call host `eval` on formula text.
- Timeouts are best-effort at builtin boundaries.

## 15. Conformance

### 15.1 Tiers

An implementation states:

```text
specRevision: "0.8.0"
tiers: ["0"]            # or ["0", "1"]
```

Tier 0 conformance means every normative rule in §§4–11, §12.1, §13, and §14, plus fixtures under `spec/fixtures/tier0/`. Tier 1 adds §12.2 and `spec/fixtures/tier1/`. Proposed sections (§12.4, §12.5) are not part of any tier yet.

### 15.2 Fixture file

Each file is a JSON object:

```json
{
  "id": "arith-mul-names",
  "formula": "price * qty",
  "context": { "price": 9.99, "qty": 3 },
  "options": { "strict": false },
  "expected": 29.97
}
```

`options` MAY be omitted (defaults). `expected` uses §7.2 for values. A host error (§10) is encoded as `{"$type":"host","kind":"parse"|"limit"|"timeout"|"unsupported"|"config"|"function"|"row"}`. Optional `tier` defaults from the directory name. Optional `skip` with a string reason marks a case not yet required. `"mode": "aggregate"` with `rows` calls `aggregate` (§4.5); `context` MAY be omitted. Other `mode` values are Proposed (§12.5.6).

Numeric expectations that are not integers SHOULD be compared with an absolute tolerance of `1e-9` unless the fixture sets `"tolerance": 0`.

### 15.3 Shared fixtures

Directory `spec/fixtures/tier0/` holds cases both languages MUST run, and `spec/fixtures/tier1/` the Tier 1 cases. Adding a fixture is a spec change.

`spec/fixtures/proposed/` holds draft cases for Proposed and Open behavior. Runners MUST NOT treat them as conformance cases. Its `README.md` explains each case.

Illustrative cases live in those directories; they are not a complete Excel corpus.

## 16. Package names (informative, Open)

Not part of semantic conformance:

| Language | Current package |
|----------|-----------------|
| Python | `excel-formula` (import `excel_formula`) |
| TypeScript | `@excel-formula/core` |

Publishing names stay **Open** on issue #4.

## 17. Use cases, corner cases, and existing solutions

This section is informative. Where it names a behavior the libraries must implement, that behavior is already normative in an earlier section. It exists so implementers do not "fix" an Excel quirk, and so we do not copy an existing engine whose API or license does not fit.

### 17.1 Use cases this revision is for

| Use case | Why this API fits | Example |
|----------|-------------------|---------|
| **Rule engine on JSON** | Named fields, one expression, no grid | `IF(qty>10, price*0.9, price)*qty` with `{price, qty}` |
| **Summarize records** | `aggregate` runs `SUM`, `PRODUCT`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, and `COUNTA` once per record (§4.5). A missing field is blank. On one object, `SUM(orders.price * orders.qty)` is the element-wise form | `aggregate("SUM(price * qty)", rows)` → `29.97` when the first record has no `price` |
| **Query records** (Proposed, §12.5) | The same formula filters a list or fills a column | `filter("region = \"EU\"", orders)`, `SUMX(orders, price*qty)` |
| **Stored business formulas** | Formulas live in a database and must run in a browser and on a server | Tax, discount, score cards |
| **Untrusted formula text** | Length, AST, list-size, and timeout limits (§14) | User-authored rules |
| **Cross-language tests** | One JSON fixture, two runners | `spec/fixtures/` |

### 17.2 Use cases this revision is not for

| Not this library | Use instead |
|------------------|-------------|
| Loading an `.xlsx` and recalculating the workbook | A workbook engine (`formulas`, `xlcalculator`, `pycel`, HyperFormula) |
| Thousands of cells, cycles, volatile `NOW()`, iterative calculation | A dependency graph. `evaluate` is one expression and does not see formulas stored in the context (§6.6) |
| Full Excel locale support (`;` argument separators, translated function names) | Out of scope until a locale revision |
| Models that depend on the 1900 leap-year bug, dynamic arrays, or `LAMBDA` | Deferred tiers |

A caller who wants "cell C1's formula uses B1's formula" must expand that graph **outside** this library and pass already-computed values in the context. That split is deliberate: it keeps the evaluator pure and easy to test.

### 17.3 Corner cases we match on purpose

These are easy to "simplify" and then fail real spreadsheets. Fixtures should grow from this list; a few already live in `spec/fixtures/tier0/`.

| Case | Excel | This spec | If we got it wrong |
|------|--------|-----------|--------------------|
| Leading `=` | Cell UI adds it; the expression is `1+1` | `=1+1` is a **parse error** (§2.1, §5.4) | We would disagree with issue #4 |
| `=` as equality | Infix operator | `1=1` is `TRUE`; a prefix `=` is not equality | Callers would slice strings themselves |
| `-2^2` | `4` | `(-2)^2` (§5.3) | Math-style `-(2^2)` = `-4` |
| `2^3^2` | `64` | Left-associative `^` (§5.2) | Math-style `2^(3^2)` = `512` |
| `10%^2` | `0.01` | `(10%)^2` | Mis-associated exponent |
| `"3"+1` | `4` | Numeric coercion (§8.1) | String concat or `#VALUE!` |
| `"3"=3` | `FALSE` | Comparisons never coerce (§8.4) | Coercing “like arithmetic” gives `TRUE` |
| `"3">2`, `"1">2` | Both `TRUE` | Ordered by type: text > number (§8.5) | Parsing the text gives `"1">2` = `FALSE` |
| `TRUE>1` | `TRUE` | Boolean > number (§8.5) | `TRUE` → `1` gives `FALSE` |
| Blank `= 0`, `= ""`, `= FALSE` | All `TRUE` | §8.4 | Blank becomes a third boolean |
| `missing<FALSE` | `FALSE` | Blank takes the other side’s type (§8.5) | Blank as `0` gives number < boolean = `TRUE` |
| Blank in arithmetic | Acts as `0` | §8.1, so `1/missing` is `#DIV/0!` when `strict` is false | Missing names would throw |
| `strict: true` missing key | Not an Excel switch | `#REF!` (§6.4) | Silent zeros hide typos |
| `IF(TRUE, 1, 1/0)` | `1` | Unused branch is not evaluated (§12.1) | Dead branch would throw |
| `IF(FALSE, 1)` | `FALSE` | Two-argument `IF` (§12.1) | Arity `#VALUE!` |
| `AND` / `OR` | All arguments run | No short-circuit (§11) | A later `#VALUE!` would disappear |
| `SUM` of a list that contains text | Text ignored | §12.1 | `"apple"` would `#VALUE!` the column |
| `SUM("3", 1)` | `4` | Direct text is coerced | Inconsistent with list `SUM` |
| `SUM(TRUE, 1)` vs `TRUE` inside a list | Direct boolean counts; boolean in a list does not | §12.1 | Off-by-one totals |
| `COUNT` of a list that contains `#DIV/0!` | Error **ignored** | §12.1 | `COUNT` unusable on dirty columns |
| `COUNT(1, 1/0)` | `1`: a direct error is not counted and does not propagate | §12.1 | `#DIV/0!` |
| `COUNT(TRUE, "3", 1)` | `3`: direct booleans and numeric text count | §12.1 | `1` |
| `COUNTA` of an error | Counts as 1, does not propagate | §12.1 | — |
| `MIN` of only text | `0` | §12.1 | `#VALUE!` or `null` |
| `0^0` | `#NUM!` | §13 | Many math libraries return `1` |
| `0^-1` | `#DIV/0!` | §13 | `#NUM!` from “non-finite” |
| `1<2<3` | `FALSE`: `(1<2)<3` → `TRUE<3`, and a boolean sorts after numbers | §5.2, §8.5 | Python-style chaining, or `TRUE` → `1`, gives `TRUE` |
| `ROUND(2.675, 2)` | `2.68` | Decimal rounding at 15 significant digits (§12.2) | Binary64 rounding gives `2.67` |
| `ZZZ1`, `q1`, `A1` | Cell addresses | Names (§6.2). `q1 * 2` with `q1` = `100` is `200` | A field named like a cell would read as blank |
| Context value `"price*qty"` | A string, unless you are a workbook | Not evaluated (§6.6) | Hidden recursion and cycles |
| `TRUE` / `FALSE` tokens | Booleans, not names | §5.1 | Context key `"TRUE"` is unreachable |
| Bare `SUM` vs `SUM(` | A name vs a call | `SUM` looks up key `SUM`; `sum(` is the builtin | Every identifier would be a function |
| `A1:A2` | A range | **Parse error** (§5.2, §6.3). `:` is not an operator | Callers would pass a rectangle |
| Space between `A1:A2` and `A2:A3` | Intersection | **Parse error** (§5.2) | Two expressions would look like one |
| `1,000` | Thousands separator in some locales | In `en-US`, comma separates arguments, so `SUM(1,000)` is `SUM(1, 0)` | Confused with one thousand |
| `0.1+0.2` | Binary64, not decimal `0.3` | IEEE number (§7.1); fixtures use tolerance (§15.2). Comparing it with `0.3`, and rendering it as text, are **Open** (§8.2, §8.4) | Decimal libraries would disagree with Excel |
| Fullwidth digits, unicode minus | Not numbers | Parse error, or `#VALUE!` on coercion | Locale "helpfulness" diverges by language |
| `LEN` of an emoji outside the BMP | UTF-16 code units (counts as 2) | §12.2 | Python `len()` counts code points and disagrees with JavaScript |

### 17.4 Deliberate deviations from Excel

These differ from Excel on purpose. Each one has a tier-0 fixture or is marked Open, so an implementation does not “fix” it silently.

| Case | Excel | This spec | Why |
|------|-------|-----------|-----|
| Leading `=` | Part of cell entry | Parse error (§5.4) | The API takes expressions (issue #4) |
| `"10%"*1` | `0.1` (also `"$1,000"`, date text) | `#VALUE!` (§8.1) | Text-to-number rules would depend on locale and formats |
| Undefined name, `strict: true` | `#NAME?` | `#REF!` (§6.4) | Kept from 0.2.0; **Open** whether to switch to `#NAME?` |
| Undefined name, `strict: false` | `#NAME?` | Blank | Sparse JSON records; a missing field should not fail the formula |
| `SUM(A1)` where the key `A1` is `TRUE` | A one-cell range: the boolean is ignored, so `SUM(A1, 1)` is `1` | `A1` is a name, so the boolean is direct and the result is `2` (§6.3, §12) | There are no cell references |
| Empty argument `IF(a,,b)` | Allowed | Parse error (§5.2) | Deferred |
| Number to text | 15 significant digits | Shortest round-trip (§8.2) | **Open** |
| `0.1+0.2=0.3` | Can be `TRUE` | `FALSE` (§8.4) | **Open** |

### 17.5 Corners we explicitly refuse

| Corner | Why it is deferred |
|--------|--------------------|
| Date serials and the 1900-02-29 fiction | Needs a date type (§7.3). Numbers are not dates. |
| `Sheet1!A1`, 3D references | No sheet model (§6.3). |
| Array constants `{1,2;3,4}`, dynamic-array spill, implicit intersection `@` | No array-constant syntax. Lists come from the context and from element-wise operators (§6.5, §7.1). |
| `R1C1` | No `referenceStyle` option (§4.2). |
| Whole-column `A:A` | `:` is not an operator, so `A:A` is a parse error (§5.2). |
| Circular references | Context strings are data, so one `evaluate` cannot cycle. A future workbook mode must define cycles separately. |

### 17.6 Existing solutions

None of these is a dependency. Several are the wrong shape (workbook or bare function calls). GPL and EUPL projects are behavior references only: do not copy their source into this repo.

| Project | What it actually is | Context | Parses `price*qty`? | Graph | License (check before copying) | What we take |
|---------|---------------------|---------|----------------------|-------|--------------------------------|--------------|
| [formulajs](https://github.com/formulajs/formulajs) | JavaScript **functions** (`SUM(1, 2)`), not a formula language | JS arguments | No | No | MIT | Per-function edges (range vs direct `SUM`, rounding). Not the architecture. |
| [fast-formula-parser](https://github.com/LesterLye/fast-formula-parser) | Parser plus evaluator aimed at a grid | `onCell` / `onRange` callbacks | Yes, usually with a leading `=` | Can list dependencies | MIT | Function-call shape. We use **names** and lists, and we reject a required `=`. |
| [HyperFormula](https://github.com/handsontable/hyperformula) | Full spreadsheet engine | Workbook, multiple sheets | Yes | Yes, including cycles | GPL-3.0 or commercial | Behavior oracle only. Do not vendor. |
| [formulas](https://github.com/vinci1it2000/formulas) (Python) | Parse Excel formulas, compile, optional `.xlsx` | Cells and compiled callables | Yes | Yes | EUPL-1.1 | Shows how large a real subset is. The workbook graph is out of scope here. |
| [pycel](https://github.com/dgorissen/pycel) | Compile a workbook to Python | `.xlsx` | Yes | Yes | GPL-3.0 | Do not vendor. |
| [xlcalculator](https://github.com/brucemike/xlcalculator) | Evaluate a loaded workbook | openpyxl cells | Yes | Yes | MIT | "Read xlsx, then eval." Our inputs are dicts, not files. |
| hot-formula-parser | Older Handsontable parser | Cell callbacks | Yes | No | MIT, unmaintained | Superseded by HyperFormula. Not a base. |

### 17.7 What we will not copy

- **A required leading `=`.** Grid UIs can prepend it before calling us. The library contract is the expression (issue #4).
- **A cell-only callback API.** Rule engines do not have `onCell`. The context is one map of names (§6).
- **Evaluating formulas found in cell values.** Workbook engines do this. We do not (§6.6), so a dict is safe to pass through without a cycle detector.
- **Their test files as our fixtures.** Those tests are copyrighted. We write our own cases under `spec/fixtures/`, using documented Excel behavior as the oracle.
- **GPL / EUPL engine source.** This spec does not require linking them.

### 17.8 Implications for the first implementation

1. Implement the parser from §5. formulajs does not parse expressions, so it cannot be the engine.
2. Treat §17.3 as the fixture backlog. Tier 0 is not done when `1+1` works; it is done when the coercion and list-vs-direct rows pass in both languages.
3. Keep the host boundary strict: parse errors and limits throw; `#DIV/0!` and `#REF!` return (§10 vs §9).
4. Add a workbook mode only after issue #4 chooses a context shape for sheets and cycles. Do not grow it inside `evaluate`.

## 18. Open questions

Tracked on [issue #4](https://github.com/manishsharma004/excel-formula/issues/4):

1. Date representation when Tier 2 date functions are added (serial vs ISO string vs typed value).
2. Whether a future workbook mode should evaluate formula strings stored in the context.
3. Sheet-qualified references: flat key `"Sheet2!A1"` vs nested maps.
4. Final PyPI / npm publish names.
5. Whether Tier 1 is required for the first public release or only Tier 0 (and Tier R, §12.5).
6. Extensibility with additional functions: the proposal in §12.4 and its open questions in §12.4.11.
7. Records, lists, and query mode: the proposal in §12.5 and its open questions in §12.5.7.
8. Number formatting and comparison at 15 significant digits (§8.2, §8.4).
9. **Decided in 0.8.0.** There are no cell references. `A1` is a name, so `SUM(A1)` follows the direct rules in §12.
10. `#NAME?` instead of `#REF!` for a missing name when `strict` is true (§6.4).

## 19. Revision history

| Revision | Date | Summary |
|----------|------|---------|
| 0.8.0 | 2026-10-17 | No spreadsheet ranges. Formulas run on objects and arrays. `*` is element-wise on lists, so `SUM(values * values)` and `SUM(values * 2)` replace `SUMSQ` and `SUMPRODUCT` |
| 0.7.0 | 2026-10-17 | Tier 0 adds `PRODUCT`, `SUMSQ`, and `SUMPRODUCT` (§12.1). `SUMPRODUCT(price, qty)` over records pairs each row. `SUMIF` / `COUNTIF` stay Deferred |
| 0.6.0 | 2026-10-17 | Nested records and lists are required (§6.7). A dotted name walks the path when it is not an exact key. Aggregations accept a column of scalars with range rules. `aggregate` evaluates `SUM(price * qty)` once per record (§4.5). `filter`, `map`, and `SUMX` stay Proposed |
| 0.5.0 | 2026-10-17 | Records requirement recorded (§2.1); records, lists, and query mode proposed (§12.5). Excel-compat corrections: comparisons never coerce (`"3"=3` is `FALSE`), ordered comparison by type with typed blanks, left-associative `^`, `1<2<3` is `FALSE`, two-argument `IF`, `COUNT` direct-argument rules, `0^-1` is `#DIV/0!`, decimal `ROUND`. Clarified number and identifier tokens, cell bounds (`XFD`), empty arguments, `maxFunctionArgs`, `maxFormulaLength` unit, `$type` reservation, direct vs range arguments. Added deliberate-deviation table (§17.4) |
| 0.4.0 | 2026-10-17 | Proposed extensibility model for additional functions (§12.4): one registry, parameter kinds, naming, volatility, packs, security. A cell-shaped token followed by `(` is a function name (`LOG10(…)`) |
| 0.3.0 | 2026-10-17 | Use cases, corner-case catalog, existing engines; COUNT ignores errors in ranges; space is not intersection |
| 0.2.0 | 2026-10-17 | Normative draft: no leading `=`, grammar, coercion, Tier 0 functions, fixture schema, limits |
| 0.1.0 | 2026-10-17 | Initial outline |
