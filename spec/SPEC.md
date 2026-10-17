# Excel formula evaluation on a context object

| Field | Value |
|-------|--------|
| **Status** | Draft — normative proposal for discussion in [issue #4](https://github.com/manishsharma004/excel-formula/issues/4) |
| **Revision** | 0.3.0 |
| **Last updated** | 2026-10-17 |
| **Compatibility target** | Microsoft Excel, **en-US**, for the subset defined here. Quirks we intentionally match are called out. Anything not specified is out of scope, not “whatever Excel does.” |

This document is the language-neutral contract for the Python and TypeScript packages (and any later implementation). Implementations MUST cite `specRevision` **0.3.0** when they claim conformance. Behavior marked **Open** is not yet required.

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
| Cell reference | Regex `^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}$` (column letters 1–3, row 1–1048576). If the token matches this pattern, it is a **cell reference**, never a name. `A1` is always a cell. |
| Range | `cell:cell` with optional whitespace around `:`. Both ends MUST be cell references. |
| Operators | `+` `-` `*` `/` `^` `&` `=` `<>` `<` `>` `<=` `>=` `%` |
| Punctuation | `(` `)` `,` |

Function names use the identifier rule and are matched **case-insensitively** against the builtin catalog. Unknown calls are `#NAME?` (§9), not host parse errors.

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
specRevision: "0.3.0"
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

`options` MAY be omitted (defaults). `expected` uses §7.2 for values. A host error (§10) is encoded as `{"$type":"host","kind":"parse"|"limit"|"timeout"|"unsupported"}`. Optional `tier` defaults from the directory name. Optional `skip` with a string reason marks a case not yet required.

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

## 19. Revision history

| Revision | Date | Summary |
|----------|------|---------|
| 0.3.0 | 2026-10-17 | Use cases, corner-case catalog, existing engines; COUNT ignores errors in ranges; space is not intersection |
| 0.2.0 | 2026-10-17 | Normative draft: no leading `=`, grammar, coercion, Tier 0 functions, fixture schema, limits |
| 0.1.0 | 2026-10-17 | Initial outline |
