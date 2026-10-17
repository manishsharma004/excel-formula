# Excel formula evaluation on a context object

| Field | Value |
|-------|--------|
| **Status** | Draft — normative proposal for discussion in [issue #4](https://github.com/manishsharma004/excel-formula/issues/4) |
| **Revision** | 0.4.0 |
| **Last updated** | 2026-10-17 |
| **Compatibility target** | Microsoft Excel, **en-US**, for the subset defined here. Quirks we intentionally match are called out. Anything not specified is out of scope, not “whatever Excel does.” |

This document is the language-neutral contract for the Python and TypeScript packages (and any later implementation). Implementations MUST cite `specRevision` **0.4.0** when they claim conformance. Behavior marked **Open** is not yet required.

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
- `R1C1`, structured table references, dynamic arrays, `LAMBDA`, `LET`, iterative calculation.
- Display formatting (currency, dates-as-text). The evaluator returns data, not formatted text.

## 2. How to read this spec

| Marker | Meaning |
|--------|---------|
| **MUST / MUST NOT** | Required for conformance at this revision |
| **Open** | Not decided; do not implement as if it were required |
| **Deferred** | Explicitly out of scope until a later revision |

Decisions are discussed in [issue #4](https://github.com/manishsharma004/excel-formula/issues/4). Change this file in the same PR that claims a decision is locked.

### 2.1 Decisions already recorded

| Topic | Rule |
|-------|------|
| Formula text | Expression only. A leading `=` is **not** part of the API (spreadsheet UI convention). `=price*qty` is a **parse error**, not a stripped prefix. |
| Evaluation mode | **Single-shot.** Context values are data. A string `"price*qty"` in the context is a string, not a nested formula. |
| Locale | `en-US` only. |

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

## 4. Public API

Each language exposes an evaluator constructed with options.

### 4.1 `evaluate(formula, context) → value`

| Input | Rule |
|-------|------|
| `formula` | String. MUST be an expression (§5). MUST NOT require or strip a leading `=`. |
| `context` | String-keyed mapping. Lookup rules in §6. Nested objects are **not** consulted in this revision (a value that is itself a mapping is an opaque non-scalar; using it yields `#VALUE!`). |
| Result | A value (§7), including an error value (§9). |

Host errors (§10) abort evaluation and are not returned as `#VALUE!`.

### 4.2 Options

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| `strict` | boolean | `false` | See §6.4 (missing keys) |
| `maxFormulaLength` | integer | `8192` | UTF-16 code units, or Unicode code points — implementations MUST document which, and fixtures use BMP text so they match |
| `maxAstNodes` | integer | `4096` | Nodes after parse |
| `maxFunctionArgs` | integer | `255` | Arguments in one call, including ranges expanded to scalars **before** this check only when the argument is a range token; a range counts as **one** argument for this limit |
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

Python and TypeScript names MAY differ (`strict` vs `strict`) but the option meanings MUST match this table.

## 5. Lexical grammar and syntax

Whitespace (U+0009, U+000A, U+000D, U+0020) MAY appear between tokens and MUST NOT appear inside numbers, cell references, or identifiers. It MUST NOT be required inside strings.

### 5.1 Tokens

| Token | Form |
|-------|------|
| Number | Excel-like decimal: optional digits, optional fraction, optional exponent. Examples: `0`, `3.14`, `.5`, `1e10`, `1E-3`. Leading `+` is not a number token (it is unary plus). Underscores and thousands separators are **not** accepted (`1,000` is a syntax error: comma is the argument separator). |
| String | `"…"` with `""` encoding one double-quote. No other escapes. Raw newlines inside strings are allowed (Excel allows them). |
| Boolean | `TRUE` / `FALSE`, case-insensitive |
| Identifier | Regex `^[A-Za-z_][A-Za-z0-9_.]*$` **after** the cell-reference rule below |
| Cell reference | Regex `^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}$` (column letters 1–3, row 1–1048576). If the token matches this pattern, it is a **cell reference**, never a name, **unless it is immediately followed by `(`**, in which case it is a function name. `A1` is always a cell; `LOG10(100)` is a call even though `LOG10` is also a valid cell address. |
| Range | `cell:cell` with optional whitespace around `:`. Both ends MUST be cell references. |
| Operators | `+` `-` `*` `/` `^` `&` `=` `<>` `<` `>` `<=` `>=` `%` |
| Punctuation | `(` `)` `,` |

Function names use the identifier rule, or the cell pattern when followed by `(`, and are matched **case-insensitively** against the function registry (§12.4). No whitespace is allowed between a function name and its `(`. Unknown calls are `#NAME?` (§9), not host parse errors.

### 5.2 Expression grammar

`^` is right-associative. All other binary operators are left-associative. Precedence from tightest to loosest:

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

Comparisons chain as in Excel: `1<2<3` is `(1<2)<3`, and the middle result is boolean, then coerced (§8).

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

`-2^2` → `4` matches Excel (unary minus is tighter than `^`), not the usual math reading `-(2^2)`.

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
- `.` is allowed (`tax.rate`) so fixtures can mirror dotted fields. The key MUST match exactly, including dots.

### 6.3 Cell lookup

- Column letters are case-insensitive. Row digits are exact.
- `$` is ignored for lookup. `$A$1`, `A$1`, `$A1`, and `a1` all resolve the key **`A1`** (column uppercased, `$` removed).
- Implementations MUST look up that canonical key only. A context that stores `"a1"` and not `"A1"` does **not** match (keys in context MUST already be canonical if they are cells). Callers normalize keys.

Column `A` → 1 … `Z` → 26, `AA` → 27, up to 3 letters. Row MUST be in `1…1048576`. Otherwise `#REF!`.

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

No date, array, or range type is returned to the caller. Ranges exist only as intermediate argument lists inside builtins.

### 7.2 JSON encoding (fixtures and host interop)

| Runtime | JSON |
|---------|------|
| Number | JSON number. Fixtures that need exact binary64 edge cases MAY use `{"$type":"number","value":"<decimal>"}` |
| String | JSON string |
| Boolean | `true` / `false` |
| Blank | `null` |
| Error | `{"$type":"error","code":"#DIV/0!"}` |

Context keys are JSON strings. Context values use the same encoding. A JSON object that is not an error wrapper is **illegal** in a scalar position and MUST be treated as `#VALUE!` if it appears as a context value (hosts SHOULD reject it at the API boundary; either behavior is conforming if fixtures do not pass raw objects).

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
| String | Trimmed (leading/trailing U+0020 only). If the remainder matches a number token, that number; else failure. `"1e2"` → `100`. `"10%"` does **not** parse as a number (percent is syntax, not a string format). |
| Error | The same error (does not become `#VALUE!`) |

### 8.2 To string (for `&` and text functions)

| From | Result |
|------|--------|
| String | Itself |
| Blank | `""` |
| Boolean | `TRUE` or `FALSE` (uppercase) |
| Number | Decimal rendering: sign if negative, no leading `+`, no thousands separator, `.` radix, enough digits to round-trip binary64 (implementations SHOULD use the same algorithm as the shortest round-trip, e.g. Dragon4 / Ryū). Integers in the safe range render without a decimal point. |
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

Compare after this Excel-like rule (first match wins):

1. If either side is an error, return that error (left, then right).
2. If either side is blank, treat blank as `0` **and** as `""` for the purpose of equality: blank equals `0`, `0.0`, `FALSE`, and `""`. Blank equals blank.
3. If both sides are strings, compare case-**insensitively** (simple case fold of A–Z only; no locale).
4. If both sides are booleans, compare identity.
5. If both sides are numbers, compare numeric equality (`-0` equals `0`).
6. If one side is a number and the other is a string that converts to a number (§8.1), compare numerically. `"3"=3` is `TRUE`.
7. Otherwise `FALSE` for `=`, and `TRUE` for `<>` (no `#VALUE!` for unlike types on equality).

### 8.5 Ordered comparisons (`<`, `>`, `<=`, `>=`)

1. Errors propagate (left, then right).
2. Blank becomes `0`.
3. If both sides convert to numbers, compare numerically.
4. If both sides are strings (and step 3 did not apply), compare case-insensitively by code unit.
5. If types still differ, Excel’s cross-type ordering applies: **number < string < boolean**. Booleans sort `FALSE` < `TRUE`. So `"3">2` is `TRUE` (string > number) even though `"3"=3` is also `TRUE`.

Implementations MUST follow this split between `=` and `<`. It is intentional Excel compatibility, not an accident.

## 9. Error values

| Code | When |
|------|------|
| `#DIV/0!` | Division by zero, or `AVERAGE` of an empty numeric set |
| `#VALUE!` | Type mismatch / failed coercion |
| `#REF!` | Cell address out of bounds, or missing key when `strict` is true |
| `#NAME?` | Unknown function name. A missing **name** is not `#NAME?`; it follows §6.4 |
| `#NUM!` | Numeric domain error (`^` with a negative base and a non-integer exponent, overflow to non-finite) |
| `#N/A` | Reserved for future lookup functions. Not produced by Tier 0 |
| `#NULL!` | Reserved (intersection). Not produced in this revision |
| `#GETTING_DATA` and others | Out of scope |

If several errors could apply, prefer the error from the **leftmost** subexpression in evaluation order (§11).

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

Messages are implementation-defined. Fixture files do not assert message text.

## 11. Evaluation order

- Subexpressions evaluate **left to right** after the parse tree is built.
- Function arguments evaluate left to right **before** the call, except `IF` and `IFERROR` (§12), which MUST NOT evaluate the unused branch.
- `AND` / `OR` MUST evaluate every argument (Excel does not short-circuit). An error in a later argument is visible even if an earlier argument is already decisive.
- Unary and binary operators evaluate their operands fully, then apply §8.

## 12. Functions

Function names are case-insensitive. Wrong arity is `#VALUE!` (Excel often uses `#VALUE!` for wrong argument counts on these functions).

A range argument is expanded to the list of cell values **in §6.5 order**, then the function’s per-value rules run. Nested ranges are not a thing (ranges are not expressions that return ranges).

### 12.1 Tier 0 (required for conformance)

#### `IF(condition, if_true, if_false)`

- Exactly 3 arguments.
- Evaluate `condition` only. Convert with §8.3.
- If that yields `TRUE`, evaluate and return `if_true` only.
- If `FALSE`, evaluate and return `if_false` only.
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

- Counts values that are numbers.
- Booleans and text do not count, whether direct or in a range.
- Blanks do not count.
- An error inside a range is ignored (Excel `COUNT`). A direct error argument propagates.

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
| `ROUND(number, digits)` | `digits` truncated toward 0. Round half **away from zero**. `digits` may be negative (round to tens, hundreds, …). |
| `ROUNDUP` / `ROUNDDOWN` | Away from / toward zero at the given decimal place. |
| `INT(number)` | Floor toward `-∞`. |
| `TRUNC(number, digits?)` | Toward zero. `digits` defaults to `0`. |

### 12.3 Tier 2 and Tier 3

**Deferred** (catalog only, no required semantics yet):

- Tier 2: `VLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`, `SUMIF`, `COUNTIF`, `DATE`, `TODAY`, `NOW`
- Tier 3: dynamic arrays, `LAMBDA`, `LET`, `FILTER`, `SORT`

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

A range passed to a `number`, `string`, `boolean`, or `scalar` parameter is `#VALUE!` (no implicit intersection, §17.4).

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

## 13. Operators (after coercion)

| Operator | Rule |
|----------|------|
| `+` `-` `*` | Numeric coercion of both sides, then IEEE operation. Non-finite result → `#NUM!`. |
| `/` | Numeric coercion. Divisor `0` or `-0` → `#DIV/0!`. |
| `^` | Numeric coercion. If base `< 0` and exponent is not an integer, `#NUM!`. `0^0` → `#NUM!` (Excel). Non-finite → `#NUM!`. |
| Unary `+` | Numeric coercion. |
| Unary `-` | Numeric coercion, then negate. |
| `%` | Numeric coercion, then multiply by `0.01`. |
| `&` | String coercion of both sides, then concatenate. |
| Comparisons | §8.4 and §8.5. Result is boolean. |

## 14. Limits and safety

Defaults are in §4.2. They exist so a server can evaluate untrusted formulas.

- There is no user-defined function and no recursion through the context, so call depth is the nesting depth of the formula. Exceeding `maxAstNodes` covers that.
- Implementations MUST NOT fetch network resources, read the filesystem, or call host `eval` on formula text.
- Timeouts are best-effort at builtin boundaries.

## 15. Conformance

### 15.1 Tiers

An implementation states:

```text
specRevision: "0.4.0"
tiers: ["0"]            # or ["0", "1"]
```

Tier 0 conformance means every normative rule in §§4–11, §12.1, §13, and §14, plus fixtures under `spec/fixtures/tier0/`.

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

`options` MAY be omitted (defaults). `expected` uses §7.2 for values. A host error (§10) is encoded as `{"$type":"host","kind":"parse"|"limit"|"timeout"|"unsupported"|"config"|"function"}`. Optional `tier` defaults from the directory name. Optional `skip` with a string reason marks a case not yet required.

Numeric expectations that are not integers SHOULD be compared with an absolute tolerance of `1e-9` unless the fixture sets `"tolerance": 0`.

### 15.3 Shared fixtures

Directory `spec/fixtures/tier0/` holds cases both languages MUST run. Adding a fixture is a spec change.

Illustrative cases live in that directory; they are not a complete Excel corpus.

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
| `10%^2` | `0.01` | `(10%)^2` | Mis-associated exponent |
| `"3"+1` | `4` | Numeric coercion (§8.1) | String concat or `#VALUE!` |
| `"3"=3` | `TRUE` | Equality coerces numeric strings (§8.4) | Strict equality |
| `"3">2` | `TRUE` | Ordered compare does **not** coerce; text > number (§8.5) | "Fixed" after seeing `"3"=3` |
| Blank `= 0`, `= ""`, `= FALSE` | All `TRUE` | §8.4 | Blank becomes a third boolean |
| Blank in arithmetic | Acts as `0` | §8.1, so `1/missing` is `#DIV/0!` when `strict` is false | Missing names would throw |
| `strict: true` missing key | Not an Excel switch | `#REF!` (§6.4) | Silent zeros hide typos |
| `IF(TRUE, 1, 1/0)` | `1` | Unused branch is not evaluated (§12.1) | Dead branch would throw |
| `AND` / `OR` | All arguments run | No short-circuit (§11) | A later `#VALUE!` would disappear |
| `SUM` of a range that contains text | Text ignored | §12.1 | `"apple"` would `#VALUE!` the column |
| `SUM("3", 1)` | `4` | Direct text is coerced | Inconsistent with range `SUM` |
| `SUM(TRUE, 1)` vs `TRUE` inside a range | Direct boolean counts; boolean in a range does not | §12.1 | Off-by-one totals |
| `COUNT` of a range that contains `#DIV/0!` | Error **ignored** | §12.1 | `COUNT` unusable on dirty columns |
| `COUNT` of a direct error | Error propagates | §12.1 | — |
| `COUNTA` of an error | Counts as 1, does not propagate | §12.1 | — |
| `MIN` of only text | `0` | §12.1 | `#VALUE!` or `null` |
| `0^0` | `#NUM!` | §13 | Many math libraries return `1` |
| `1<2<3` | `(TRUE)<3` after boolean→number | §5.2, §8 | Python-style chaining would yield `TRUE` |
| Context value `"price*qty"` | A string, unless you are a workbook | Not evaluated (§6.6) | Hidden recursion and cycles |
| `TRUE` / `FALSE` tokens | Booleans, not names | §5.1 | Context key `"TRUE"` is unreachable |
| Bare `SUM` vs `SUM(` | A name vs a call | `SUM` looks up key `SUM`; `sum(` is the builtin | Every identifier would be a function |
| `A1` | Always a cell | Never a name (§5.1, §6.3) | A field named `A1` would steal the cell |
| `$a$1` | Cell `A1` | Canonical key `A1` (§6.3) | Duplicate keys `a1` / `A1` |
| Space between ranges | Intersection | **Parse error** (§5.2) | Two ranges would look like one expression |
| `1,000` | Thousands separator in some locales | In `en-US`, comma separates arguments, so `SUM(1,000)` is `SUM(1, 0)` | Confused with one thousand |
| `0.1+0.2` | Binary64, not decimal `0.3` | IEEE number (§7.1); fixtures use tolerance (§15.2) | Decimal libraries would disagree with Excel |
| Fullwidth digits, unicode minus | Not numbers | Parse error, or `#VALUE!` on coercion | Locale "helpfulness" diverges by language |
| `LEN` of an emoji outside the BMP | UTF-16 code units (counts as 2) | §12.2 | Python `len()` counts code points and disagrees with JavaScript |

### 17.4 Corners we explicitly refuse

| Corner | Why it is deferred |
|--------|--------------------|
| Date serials and the 1900-02-29 fiction | Needs a date type (§7.3). Numbers are not dates. |
| `Sheet1!A1`, 3D ranges | No sheet model (§6.5). |
| Array constants `{1,2;3,4}`, dynamic arrays, implicit intersection `@` | No array value (§7.1). |
| `R1C1` | Unsupported option (§4.2). |
| Whole-column `A:A` | The cell token requires a row (§5.1), so `A:A` is a parse error. Materializing a million cells would also trip `maxRangeCells`. |
| Circular references | Context strings are data, so one `evaluate` cannot cycle. A future workbook mode must define cycles separately. |

### 17.5 Existing solutions

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

### 17.6 What we will not copy

- **A required leading `=`.** Grid UIs can prepend it before calling us. The library contract is the expression (issue #4).
- **A cell-only callback API.** Rule engines do not have `onCell`. Names and `A1` keys share one map (§6).
- **Evaluating formulas found in cell values.** Workbook engines do this. We do not (§6.6), so a dict is safe to pass through without a cycle detector.
- **Their test files as our fixtures.** Those tests are copyrighted. We write our own cases under `spec/fixtures/`, using documented Excel behavior as the oracle.
- **GPL / EUPL engine source.** This spec does not require linking them.

### 17.7 Implications for the first implementation

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
5. Whether Tier 1 is required for the first public release or only Tier 0.
6. Extensibility with additional functions: the proposal in §12.4 and its open questions in §12.4.11.

## 19. Revision history

| Revision | Date | Summary |
|----------|------|---------|
| 0.4.0 | 2026-10-17 | Proposed extensibility model for additional functions (§12.4): one registry, parameter kinds, naming, volatility, packs, security. A cell-shaped token followed by `(` is a function name (`LOG10(…)`) |
| 0.3.0 | 2026-10-17 | Use cases, corner-case catalog, existing engines; COUNT ignores errors in ranges; space is not intersection |
| 0.2.0 | 2026-10-17 | Normative draft: no leading `=`, grammar, coercion, Tier 0 functions, fixture schema, limits |
| 0.1.0 | 2026-10-17 | Initial outline |
