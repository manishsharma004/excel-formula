# Excel formula evaluation on a context object

| Field | Value |
|-------|--------|
| **Status** | Draft — normative proposal for discussion in [issue #4](https://github.com/manishsharma004/excel-formula/issues/4) |
| **Revision** | 0.5.0 |
| **Last updated** | 2026-10-17 |
| **Compatibility target** | Microsoft Excel, **en-US**, for the subset defined here. Quirks we intentionally match are called out. Deliberate deviations are listed in §17.4. Anything not specified is out of scope, not “whatever Excel does.” |

This document is the language-neutral contract for the Python and TypeScript packages (and any later implementation). Implementations MUST cite `specRevision` **0.5.0** when they claim conformance. Behavior marked **Open** or **Proposed** is not yet required.

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
- `R1C1`, structured table references, dynamic arrays (array **results** and element-wise array arithmetic), `LAMBDA`, `LET`, iterative calculation. Lists of records as **inputs** are proposed in §12.5.
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
| Records requirement | Aggregation functions MUST accept **lists of records**. A formula with no aggregation function MUST be usable both as a **calculation** (evaluated on one record) and as a **query** (a predicate over many records). The requirement is agreed; the design that meets it is §12.5 (**Proposed**). |

## 3. Terminology

| Term | Meaning |
|------|---------|
| **Formula** | The expression string passed to `evaluate` |
| **Context** | Mapping from string keys to values (§6) |
| **Name** | An identifier that is not a cell address, e.g. `price`, `tax_rate` |
| **Cell reference** | An `A1`-style address, e.g. `A1`, `$B$2` |
| **Blank** | The empty value (JSON `null`). Distinct from `0`, `""`, and `FALSE` |
| **Error value** | A spreadsheet error such as `#DIV/0!` (§9). It is a **return value**, not a thrown exception, unless the failure is a host limit or a parse error |
| **Host error** | Parse failure or a limit exceeded. Raised/thrown; not an Excel error value |
| **Direct argument** | A function argument that is not a range: a literal, an operator expression, a function result, a name, or a single cell reference (see §12, “Direct arguments and references”) |
| **Record**, **List**, **Column** | Proposed non-scalar context values (§12.5) |
| **Row formula** | A formula that calls no aggregation function. Proposed to be usable as a calculation and as a query (§12.5) |

## 4. Public API

Each language exposes an evaluator constructed with options.

### 4.1 `evaluate(formula, context) → value`

| Input | Rule |
|-------|------|
| `formula` | String. MUST be an expression (§5). MUST NOT require or strip a leading `=`. |
| `context` | String-keyed mapping. Lookup rules in §6. Nested objects and arrays are **not** consulted by the required (non-Proposed) rules of this revision: a value that is itself a mapping or an array is an opaque non-scalar, and using it yields `#VALUE!`. §12.5 proposes how records and lists are read. |
| Result | A value (§7), including an error value (§9). |

Host errors (§10) abort evaluation and are not returned as `#VALUE!`.

### 4.2 Options

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| `strict` | boolean | `false` | See §6.4 (missing keys) |
| `maxFormulaLength` | integer | `8192` | Measured in UTF-16 code units in every language, the same unit as `LEN` (§12.2) |
| `maxAstNodes` | integer | `4096` | Nodes after parse |
| `maxFunctionArgs` | integer | `255` | Arguments written in one call. A range counts as **one** argument, however many cells it covers |
| `maxRangeCells` | integer | `10000` | Cells materialized from one range |
| `timeoutMs` | integer or absent | absent | If set, evaluation MUST fail with a host **timeout** error when exceeded. Implementations MAY poll between function calls; they are not required to preempt a single builtin |

Function registry options (`functions`, `builtins`, `clock`) are proposed in §12.4.

`referenceStyle` other than `"A1"` and `formulaLocale` other than `"en-US"` are **Deferred**. Passing them MUST be a host error (unsupported option), not silent ignore.

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

## 5. Lexical grammar and syntax

Whitespace (U+0009, U+000A, U+000D, U+0020) MAY appear between tokens and MUST NOT appear inside numbers, cell references, or identifiers. It MUST NOT be required inside strings.

### 5.1 Tokens

| Token | Form |
|-------|------|
| Number | Regex `^([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$`. Examples: `0`, `3.14`, `.5`, `1.`, `1e10`, `1E-3`. A lone `.` is not a number. Leading `+` is not a number token (it is unary plus). Underscores and thousands separators are **not** accepted (`SUM(1,000)` is `SUM(1, 0)`: comma is the argument separator). |
| String | `"…"` with `""` encoding one double-quote. No other escapes. Raw newlines inside strings are allowed (Excel allows them). |
| Boolean | `TRUE` / `FALSE`, case-insensitive |
| Identifier | Dot-separated segments: regex `^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$`, applied **after** the cell-reference rule below. `a..b`, `a.`, and `a.1` are not identifiers. |
| Cell reference | Regex `^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}$`. If the token matches this pattern, it is a **cell reference**, never a name, **unless it is immediately followed by `(`**, in which case it is a function name. `A1` is always a cell; `LOG10(100)` is a call even though `LOG10` is also a valid cell address. A token that matches the pattern but is out of bounds (column after `XFD`, row `0` or after `1048576`) is still a cell reference and evaluates to `#REF!` (§6.3). |
| Range | `cell:cell` with optional whitespace around `:`. Both ends MUST be cell references. |
| Operators | `+` `-` `*` `/` `^` `&` `=` `<>` `<` `>` `<=` `>=` `%` |
| Punctuation | `(` `)` `,` |

Function names use the identifier rule, or the cell pattern when followed by `(`, and are matched **case-insensitively** against the function registry (§12.4). No whitespace is allowed between a function name and its `(`. Unknown calls are `#NAME?` (§9), not host parse errors.

### 5.2 Expression grammar

All binary operators are **left-associative**, including `^`: `2^3^2` is `(2^3)^2` = `64`, as in Excel (not `512` as in mathematics). Precedence from tightest to loosest:

| Precedence | Forms |
|------------|--------|
| 1 | Range `:`, already a token pair `ref:ref` (intersection and union are **Deferred**) |
| 2 | Unary `+` and unary `-` |
| 3 | Postfix `%` |
| 4 | `^` |
| 5 | `*` `/` |
| 6 | `+` `-` |
| 7 | `&` |
| 8 | `=` `<>` `<` `>` `<=` `>=` |

```text
expr        := comparison
comparison  := concat ( comp_op concat )*
concat      := additive ( "&" additive )*
additive    := multiplicative ( ( "+" | "-" ) multiplicative )*
multiplicative := power ( ( "*" | "/" ) power )*
power       := percent ( "^" percent )*
percent     := unary "%"*
unary       := ( "+" | "-" ) unary | primary
primary     := number | string | boolean | ref | function_call | "(" expr ")"
ref         := cell | cell ":" cell | name
function_call := ident "(" [ expr ( "," expr )* ] ")"
name        := identifier that is not a cell reference
```

An argument slot MUST NOT be empty. `IF(a,,b)` and `ROUND(x,)` are host parse errors in this revision (Excel accepts them; **Deferred**). Fewer arguments, as in `LEFT(text)`, are allowed where a function says so.

Comparisons chain as in Excel: `1<2<3` is `(1<2)<3` → `TRUE<3`. Ordered comparison does not convert booleans to numbers, and a boolean sorts after every number (§8.5), so the result is `FALSE`.

Excel’s intersection operator (a space between two ranges) and union operator (a comma that is not a function-argument separator) are **Deferred**. Whitespace is never an operator. `A1:A2 A2:A3` is a host parse error.

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

### 6.1 Flat mapping

The context is one flat string → value map. This revision is a **hybrid** of names and cell addresses:

```json
{ "price": 9.99, "qty": 3, "A1": 10, "B1": 20 }
```

Both `price * qty` and `A1 + B1` are valid. There is no separate sheet object.

### 6.2 Name lookup

- Names are **case-sensitive**. `price` and `Price` are different keys.
- The identifier in the formula is used as the key with its exact spelling.
- `.` is allowed (`tax.rate`) so fixtures can mirror dotted fields. The key MUST match exactly, including dots. §12.5 proposes that a dotted name which is not an exact key navigates nested records; an exact key always wins.
- A key that is not an identifier (contains a space or `-`, starts with a digit) cannot be written in this revision. A key that is shaped like a cell (`q1`, `vat20`) is read as a **cell**, not a name (§5.1). §12.5 proposes an option to turn cell references off for record data.

### 6.3 Cell lookup

- Column letters are case-insensitive. Row digits are exact.
- `$` is ignored for lookup. `$A$1`, `A$1`, `$A1`, and `a1` all resolve the key **`A1`** (column uppercased, `$` removed).
- Implementations MUST look up that canonical key only. A context that stores `"a1"` and not `"A1"` does **not** match (keys in context MUST already be canonical if they are cells). Callers normalize keys.

Column `A` → 1 … `Z` → 26, `AA` → 27, up to `XFD` → 16384. Row MUST be in `1…1048576`. A cell outside those bounds (for example `ZZZ1` or `A0`) evaluates to `#REF!`, in both lax and strict mode. A range with an out-of-bounds corner is `#REF!`.

### 6.4 Missing keys

| `strict` | Missing name or cell |
|----------|----------------------|
| `false` (default) | **Blank** |
| `true` | Error value `#REF!` |

Blank then follows coercion (§8). So with `strict: false`, `missing + 1` is `1`. With `strict: true`, it is `#REF!`.

### 6.5 Ranges

`A1:B2` is the inclusive rectangle. Expansion order is **row-major, left to right**: `A1`, `B1`, `A2`, `B2`.

- Reversed corners are normalized (`B2:A1` is the same rectangle as `A1:B2`).
- If the cell count exceeds `maxRangeCells`, host error **limit**.
- Each cell is resolved with §6.3–§6.4. A range is not a scalar. It is only legal as a **function argument**. Using a range as an operator operand (`A1:A2 + 1`) is `#VALUE!`.
- 3D ranges (`Sheet1:Sheet2!A1`) and sheet-qualified refs (`Sheet2!A1`) are **Deferred** and MUST be parse errors in this revision (the `!` character is not a token).

### 6.6 Context values that look like formulas

`"price*qty"` stored in the context is a **string**. It is not parsed. Single-shot evaluation only walks the formula argument.

## 7. Value model

### 7.1 Runtime types

| Type | Definition |
|------|------------|
| Number | IEEE-754 binary64. NaN and infinities MUST NOT be produced; operations that would produce them become `#NUM!` or `#DIV/0!` as specified per operator. |
| String | Unicode scalar values. No implicit NFKC normalization. |
| Boolean | `TRUE` or `FALSE` |
| Blank | Empty. Exactly one blank value. |
| Error | One of the codes in §9. Carries no extra payload in this revision. |

No date, array, or range type is returned to the caller. Ranges exist only as intermediate argument lists inside builtins. §12.5 proposes records and lists as non-scalar **inputs**; they are still never a result of `evaluate`.

### 7.2 JSON encoding (fixtures and host interop)

| Runtime | JSON |
|---------|------|
| Number | JSON number. Fixtures that need exact binary64 edge cases MAY use `{"$type":"number","value":"<decimal>"}` |
| String | JSON string |
| Boolean | `true` / `false` |
| Blank | `null` |
| Error | `{"$type":"error","code":"#DIV/0!"}` |

Context keys are JSON strings. Context values use the same encoding. A JSON object that is not a `$type` wrapper, or a JSON array, is a non-scalar. Under the required rules it is `#VALUE!` wherever a scalar is needed. §12.5 proposes reading it as a record or list.

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
| `limit` | Formula length, AST size, argument count, or range size exceeded |
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

A range argument is expanded to the list of cell values **in §6.5 order**, then the function’s per-value rules run. Nested ranges are not a thing (ranges are not expressions that return ranges).

**Direct arguments and references.** The rules below distinguish values **in a range** from **direct** arguments. In this revision a name and a single cell reference are **direct**: `SUM(flag)` with `flag` = `TRUE` is `1`, the same as `SUM(TRUE)`. Excel treats a single-cell reference like a one-cell range, so `SUM(A1)` with `A1` = `TRUE` is `0` in Excel. Matching that for cell references (but not for names) is **Open** on issue #4.

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
- Inside a range, **non-numeric text is ignored**, blanks are ignored, numbers and booleans count. If a range contributes **zero** scalars and there is no other scalar argument, the result is `#VALUE!`.
- `AND` is `TRUE` iff every counted scalar is `TRUE`.
- `OR` is `TRUE` iff any counted scalar is `TRUE`.
- Direct (non-range) arguments that fail §8.3 produce `#VALUE!` (they are not ignored).

#### `NOT(arg)`

- Exactly one argument, which MUST be scalar (a range is `#VALUE!`).
- Convert with §8.3 and negate.

#### `SUM(arg1, …)`

- At least one argument.
- Numbers are added.
- Booleans: in a **range**, ignored; as a **direct** argument, coerced to 1/0 (Excel).
- Blanks ignored.
- Text in a **range**: ignored. Text as a **direct** argument: coerce with §8.1 or `#VALUE!`.
- Errors anywhere in the considered values propagate.

#### `AVERAGE(arg1, …)`

- Same membership rules as `SUM` for which values count as numbers.
- Result is the arithmetic mean.
- If zero numbers were counted, `#DIV/0!`.

#### `MIN(arg1, …)` / `MAX(arg1, …)`

- Same membership as `SUM`.
- If zero numbers were counted, result is `0` (Excel).

#### `COUNT(arg1, …)`

- In a **range**: only numbers count. Booleans, text, blanks, and errors are skipped.
- **Direct** arguments: a number counts; a boolean counts; text counts if it converts to a number under §8.1 (`"3"` counts, `"abc"` does not); blank does not count.
- Errors never propagate, direct or in a range. They are not counted. `COUNT(1, 1/0)` is `1`. This is Excel `COUNT`.
- Example: `COUNT(TRUE, "3", 1)` is `3`.

#### `COUNTA(arg1, …)`

- Counts non-blank values.
- Numbers, text, booleans, and errors all count. Errors do **not** propagate; each error counts as one (Excel `COUNTA`).
- Blanks do not count.
- A direct empty string `""` counts (it is text, not blank).

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
| `CONCAT(arg1, …)` | At least one argument. Each scalar converted with §8.2 and appended. Ranges: each cell converted with §8.2; blank becomes `""`. Errors propagate. |

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

That is a design constraint, not a convenience. If the Tier 0 builtins can be written with the public extension API, the API is proven expressive enough for real Excel functions (lazy `IF`, range-aware `SUM`). If builtins need private hooks, custom functions will hit the same wall.

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
- A name MAY match the cell-reference pattern. `LOG10` is both a valid cell (column `LOG`, row `10`) and a real Excel function. The `(` decides (§5.1): `LOG10(100)` is a call, bare `LOG10` is the cell.
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

Parameter kinds decide **what the implementation receives**. The evaluator does the work, so every function treats ranges, errors, and laziness the same way:

| Kind | The implementation receives | Errors | Typical use |
|------|-----------------------------|--------|-------------|
| `number` | A number, coerced with §8.1 | An error argument short-circuits: the function is not called, the error is returned | `ROUND`, `ACME.TAX` |
| `string` | A string, coerced with §8.2 | Same | `LEFT`, `LEN` |
| `boolean` | A boolean, coerced with §8.3 | Same | `NOT` |
| `scalar` | Any scalar value, uncoerced, including blank and error values | Passed through; the function decides | `IFERROR`, `ISBLANK` |
| `values` | A flat list in §6.5 order. Each item is tagged **direct** or **from range**, because Excel treats them differently (§12.1 `SUM`) | Passed through | `SUM`, `COUNT`, `CONCAT` |
| `range` | A rectangle: row and column count plus cell values. A non-range argument is `#VALUE!` | Passed through | `INDEX`, `VLOOKUP` (Tier 2) |
| `lazy` | A thunk. The argument is evaluated only if and when the implementation calls it, at most once | Whatever the thunk returns | `IF`, `IFERROR`, `CHOOSE` |
| `list` (Proposed, §12.5) | A list of records or scalars, or a column. A scalar or range argument is `#VALUE!` | Passed through | `COUNTROWS`, `SUMX` |
| `perRow` (Proposed, §12.5) | A function of one record: each call evaluates the argument with that record pushed as the innermost scope (§12.5.2). It may be called any number of times | Whatever each call returns | `SUMX`, `FILTER` |

A range passed to a `number`, `string`, `boolean`, or `scalar` parameter is `#VALUE!` (no implicit intersection, §17.5).

#### 12.4.5 Implementation contract

- The implementation receives the converted arguments and a small **call context**: the evaluator options, a clock (§12.4.7), and a `checkTimeout()` hook.
- It MUST return a value from §7.1. It returns spreadsheet errors as error **values** (the language binding provides a constructor, for example `ExcelError("#N/A")`). It does not throw them.
- Returning anything else (a list, a dict, `NaN`, `undefined`, a date object) is a host error **`function`**.
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
- Range arguments are materialized under `maxRangeCells`, so a custom function cannot be used to bypass that limit.

#### 12.4.11 Open questions for issue #4

1. Should a custom function that throws produce a host error **`function`** (proposed) or `#VALUE!` like Excel add-ins often do?
2. Is the dotted-namespace rule a MUST, or only a SHOULD with a warning on upgrade collisions?
3. Should `override: true` of a builtin be allowed at all, or only replacing a builtin via `builtins` plus a new name?
4. Do we need `lazy` parameters for custom functions, or only for builtins? (`lazy` is required to write `IF` with the public API.)
5. How should `evaluate` report that a volatile function ran: a separate method, an options flag, or a result wrapper?
6. Do we ever allow async functions, or keep "fetch first, then evaluate" as a permanent rule?
7. Should `LAMBDA` / `LET` (Tier 3) be how users define functions *in formula text*, as a second, sandboxed extension route that needs no host code?

### 12.5 Records, lists, and query mode (Proposed, “Tier R”)

**Status: Proposed.** The requirement in §2.1 is agreed: aggregations accept lists of records, and a formula without aggregation is both a calculation and a query. This section is the proposed design. It is not required until issue #4 locks it. Draft fixtures are in [`spec/fixtures/proposed/records/`](fixtures/proposed/records/), and the reasoning is in [`spec/REVIEW.md`](REVIEW.md) Part A.

#### 12.5.1 Records, lists, columns, and paths

- A context value MAY be a **record** (JSON object) or a **list** (JSON array), at any depth. Both are non-scalar.
- A dotted name `a.b.c` first tries the exact key `"a.b.c"` in the current scope (§6.2). If that key does not exist, `a` is resolved in the current scope (§12.5.2), and each next segment is looked up as a key of the record reached so far.
- A segment applied to a **list** applies the rest of the path to every element. The result is a **column**: a list of values in element order. A list reached inside a list is flattened one level per hop, so `orders.items.qty` is every item’s `qty` across all orders.
- A segment applied to blank yields blank. A segment applied to any other scalar yields `#VALUE!`. A missing key follows §6.4.
- A record, list, or column used as an operator operand, as a scalar parameter, or as the top-level result of `evaluate` is `#VALUE!`. `orders.price * 2` and `SUM(orders.price * orders.qty)` are `#VALUE!`: there is no element-wise array arithmetic (Deferred).

#### 12.5.2 Scope

Evaluation keeps a stack of scopes. The root scope is the context. `filter` and `map` (§12.5.4), and each row of a row-scoped function (§12.5.5), push the current record.

A bare name, or the first segment of a path, resolves in the innermost scope **whose record contains that key, even when the value is null**. If no scope contains the key, §6.4 applies. So in `filter("amount > threshold", rows, {threshold: 100})`, `amount` comes from the row and `threshold` from the root. A row with `"rate": null` gets blank for `rate`; a row with no `rate` key falls back to an outer `rate`.

#### 12.5.3 Aggregations over lists and columns

Every Tier 0 and Tier 1 function that accepts a range (`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `AND`, `OR`, `CONCAT`) also accepts a list of scalars or a column, with exactly the **in a range** rules of §12.1. Text and booleans are skipped by `SUM`, blanks are skipped by `AVERAGE`, and so on. A list of **records** passed to these functions is `#VALUE!` (`SUM(orders)`).

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
- Option `cellReferences` (default **Open**: `true` keeps §5.1; `false` reads cell-shaped tokens such as `q1` as names). Record data often has such keys.

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

**Invariant.** The per-row results form a column, and the aggregate applies its **in a range** rules (§12.1) to that column. Therefore `SUMX(orders, price)` equals `SUM(orders.price)`. An error in a per-row result propagates through `SUMX`, `AVERAGEX`, `MINX`, and `MAXX`, and is skipped by `COUNTX` and counted by `COUNTAX`.

`SUM(orders, price*qty)` is not a substitute. `SUM(a, b)` already means `a + b`, and whether `price*qty` runs once or per row cannot depend on the runtime type of `orders`.

#### 12.5.6 Fixtures

Proposed fixtures add `"mode": "evaluate" | "filter" | "map"` (default `evaluate`), `"rows"`, and `options.onRowError` / `options.cellReferences`. For `filter`, `expected` is the list of **0-based indexes** of kept rows.

#### 12.5.7 Open questions for issue #4

1. Per-row fallback to an outer scope (§12.5.2) versus an explicit qualifier such as `ROOT.rate`.
2. Whether `strict` also covers missing **fields** in records, or only top-level names.
3. A syntax for keys that are not identifiers, for example `[unit price]` and `[q1]`.
4. The default for `cellReferences` in `filter` / `map`.
5. Grouping (`groupBy(keyFormula, aggregateFormula, rows)`).
6. Element-wise array arithmetic (`orders.price * orders.qty` as a column).

## 13. Operators (after coercion)

| Operator | Rule |
|----------|------|
| `+` `-` `*` | Numeric coercion of both sides, then IEEE operation. Non-finite result → `#NUM!`. |
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
specRevision: "0.5.0"
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

`options` MAY be omitted (defaults). `expected` uses §7.2 for values. A host error (§10) is encoded as `{"$type":"host","kind":"parse"|"limit"|"timeout"|"unsupported"|"config"|"function"|"row"}`. Optional `tier` defaults from the directory name. Optional `skip` with a string reason marks a case not yet required. Proposed fields `mode` and `rows` are described in §12.5.6.

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
| **Query and summarize records** (Proposed, §12.5) | The same rule filters a list, fills a column, or feeds an aggregate | `filter("region = \"EU\"", orders)`, `SUMX(orders, price*qty)` |
| **Stored business formulas** | Formulas live in a database and must run in a browser and on a server | Tax, discount, score cards |
| **Small spreadsheet UI** | Same evaluator resolves `A1` and `SUM(A1:A10)` from a flat cell map | In-memory grid, not an `.xlsx` |
| **Untrusted formula text** | Length, AST, range, and timeout limits (§14) | User-authored rules |
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
| `SUM` of a range that contains text | Text ignored | §12.1 | `"apple"` would `#VALUE!` the column |
| `SUM("3", 1)` | `4` | Direct text is coerced | Inconsistent with range `SUM` |
| `SUM(TRUE, 1)` vs `TRUE` inside a range | Direct boolean counts; boolean in a range does not | §12.1 | Off-by-one totals |
| `COUNT` of a range that contains `#DIV/0!` | Error **ignored** | §12.1 | `COUNT` unusable on dirty columns |
| `COUNT(1, 1/0)` | `1`: a direct error is not counted and does not propagate | §12.1 | `#DIV/0!` |
| `COUNT(TRUE, "3", 1)` | `3`: direct booleans and numeric text count | §12.1 | `1` |
| `COUNTA` of an error | Counts as 1, does not propagate | §12.1 | — |
| `MIN` of only text | `0` | §12.1 | `#VALUE!` or `null` |
| `0^0` | `#NUM!` | §13 | Many math libraries return `1` |
| `0^-1` | `#DIV/0!` | §13 | `#NUM!` from “non-finite” |
| `1<2<3` | `FALSE`: `(1<2)<3` → `TRUE<3`, and a boolean sorts after numbers | §5.2, §8.5 | Python-style chaining, or `TRUE` → `1`, gives `TRUE` |
| `ROUND(2.675, 2)` | `2.68` | Decimal rounding at 15 significant digits (§12.2) | Binary64 rounding gives `2.67` |
| `ZZZ1` | `#REF!` (column after `XFD`) | §6.3 | A missing-key blank |
| Context value `"price*qty"` | A string, unless you are a workbook | Not evaluated (§6.6) | Hidden recursion and cycles |
| `TRUE` / `FALSE` tokens | Booleans, not names | §5.1 | Context key `"TRUE"` is unreachable |
| Bare `SUM` vs `SUM(` | A name vs a call | `SUM` looks up key `SUM`; `sum(` is the builtin | Every identifier would be a function |
| `A1` | Always a cell | Never a name (§5.1, §6.3) | A field named `A1` would steal the cell |
| `$a$1` | Cell `A1` | Canonical key `A1` (§6.3) | Duplicate keys `a1` / `A1` |
| Space between ranges | Intersection | **Parse error** (§5.2) | Two ranges would look like one expression |
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
| `SUM(A1)` where `A1` is `TRUE` or text | Reference rules: ignored | Direct rules: `TRUE` → `1`, `"3"` → `3` (§12) | **Open** for cell references |
| Empty argument `IF(a,,b)` | Allowed | Parse error (§5.2) | Deferred |
| Number to text | 15 significant digits | Shortest round-trip (§8.2) | **Open** |
| `0.1+0.2=0.3` | Can be `TRUE` | `FALSE` (§8.4) | **Open** |

### 17.5 Corners we explicitly refuse

| Corner | Why it is deferred |
|--------|--------------------|
| Date serials and the 1900-02-29 fiction | Needs a date type (§7.3). Numbers are not dates. |
| `Sheet1!A1`, 3D ranges | No sheet model (§6.5). |
| Array constants `{1,2;3,4}`, dynamic arrays, implicit intersection `@` | No array value (§7.1). Lists of records as **inputs** are a separate proposal (§12.5). |
| `R1C1` | Unsupported option (§4.2). |
| Whole-column `A:A` | The cell token requires a row (§5.1), so `A:A` is a parse error. Materializing a million cells would also trip `maxRangeCells`. |
| Circular references | Context strings are data, so one `evaluate` cannot cycle. A future workbook mode must define cycles separately. |

### 17.6 Existing solutions

None of these is a dependency. Several are the wrong shape (workbook or bare function calls). GPL and EUPL projects are behavior references only: do not copy their source into this repo.

| Project | What it actually is | Context | Parses `price*qty`? | Graph | License (check before copying) | What we take |
|---------|---------------------|---------|----------------------|-------|--------------------------------|--------------|
| [formulajs](https://github.com/formulajs/formulajs) | JavaScript **functions** (`SUM(1, 2)`), not a formula language | JS arguments | No | No | MIT | Per-function edges (range vs direct `SUM`, rounding). Not the architecture. |
| [fast-formula-parser](https://github.com/LesterLye/fast-formula-parser) | Parser plus evaluator aimed at a grid | `onCell` / `onRange` callbacks | Yes, usually with a leading `=` | Can list dependencies | MIT | Tokenizer shape: cells, ranges, functions. We still need **names**, and we reject a required `=`. |
| [HyperFormula](https://github.com/handsontable/hyperformula) | Full spreadsheet engine | Workbook, multiple sheets | Yes | Yes, including cycles | GPL-3.0 or commercial | Behavior oracle only. Do not vendor. |
| [formulas](https://github.com/vinci1it2000/formulas) (Python) | Parse Excel formulas, compile, optional `.xlsx` | Cells and compiled callables | Yes | Yes | EUPL-1.1 | Shows how large a real subset is. The workbook graph is out of scope here. |
| [pycel](https://github.com/dgorissen/pycel) | Compile a workbook to Python | `.xlsx` | Yes | Yes | GPL-3.0 | Do not vendor. |
| [xlcalculator](https://github.com/brucemike/xlcalculator) | Evaluate a loaded workbook | openpyxl cells | Yes | Yes | MIT | "Read xlsx, then eval." Our inputs are dicts, not files. |
| hot-formula-parser | Older Handsontable parser | Cell callbacks | Yes | No | MIT, unmaintained | Superseded by HyperFormula. Not a base. |

### 17.7 What we will not copy

- **A required leading `=`.** Grid UIs can prepend it before calling us. The library contract is the expression (issue #4).
- **A cell-only callback API.** Rule engines do not have `onCell`. Names and `A1` keys share one map (§6).
- **Evaluating formulas found in cell values.** Workbook engines do this. We do not (§6.6), so a dict is safe to pass through without a cycle detector.
- **Their test files as our fixtures.** Those tests are copyrighted. We write our own cases under `spec/fixtures/`, using documented Excel behavior as the oracle.
- **GPL / EUPL engine source.** This spec does not require linking them.

### 17.8 Implications for the first implementation

1. Implement the parser from §5. formulajs does not parse expressions, so it cannot be the engine.
2. Treat §17.3 as the fixture backlog. Tier 0 is not done when `1+1` works; it is done when the coercion and range-vs-direct rows pass in both languages.
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
9. Reference semantics for single cell references in functions (§12, “Direct arguments and references”).
10. `#NAME?` instead of `#REF!` for a missing name when `strict` is true (§6.4).

## 19. Revision history

| Revision | Date | Summary |
|----------|------|---------|
| 0.5.0 | 2026-10-17 | Records requirement recorded (§2.1); records, lists, and query mode proposed (§12.5). Excel-compat corrections: comparisons never coerce (`"3"=3` is `FALSE`), ordered comparison by type with typed blanks, left-associative `^`, `1<2<3` is `FALSE`, two-argument `IF`, `COUNT` direct-argument rules, `0^-1` is `#DIV/0!`, decimal `ROUND`. Clarified number and identifier tokens, cell bounds (`XFD`), empty arguments, `maxFunctionArgs`, `maxFormulaLength` unit, `$type` reservation, direct vs range arguments. Added deliberate-deviation table (§17.4) |
| 0.4.0 | 2026-10-17 | Proposed extensibility model for additional functions (§12.4): one registry, parameter kinds, naming, volatility, packs, security. A cell-shaped token followed by `(` is a function name (`LOG10(…)`) |
| 0.3.0 | 2026-10-17 | Use cases, corner-case catalog, existing engines; COUNT ignores errors in ranges; space is not intersection |
| 0.2.0 | 2026-10-17 | Normative draft: no leading `=`, grammar, coercion, Tier 0 functions, fixture schema, limits |
| 0.1.0 | 2026-10-17 | Initial outline |
