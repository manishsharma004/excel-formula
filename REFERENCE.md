# Formula reference

This is the guide for formulas evaluated by `@excel-formula/core` and `excel_formula`, spec **0.8.0**. The library reads objects and arrays. It is not a spreadsheet, and it has no cell ranges. It describes the language you type in the playground. The normative rules are in [`spec/SPEC.md`](spec/SPEC.md).

A formula is an expression. Do not start it with `=`. `=price*qty` is a parse error. Write `price * qty`.

```text
evaluate("price * qty", { "price": 9.99, "qty": 3 }) → 29.97
```

## Playground

| Control | What it does |
|---------|----------------|
| Single record | The JSON object is the context. `price` reads that object's `price`. |
| Array of records, Calculate | One result per record. `price * qty` returns a list. |
| Array of records, Query | Keeps records whose formula is `TRUE`. |
| Array of records, Aggregate | `SUM`, `PRODUCT`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, and `COUNTA` run once per record, then combine. |
| JavaScript / TypeScript | The page evaluates with the TypeScript engine. |
| Python | The page evaluates with the Python engine in Pyodide. |

A setup script may return `{ data, formula }` to replace the inputs before evaluation. It runs in the page. It is not a sandbox.

## Values

| Type | You write | JSON |
|------|-----------|------|
| Number | `9.99`, `.5`, `1e10` | JSON number |
| String | `"EU"`; a quote inside a string is `""` | JSON string |
| Boolean | `TRUE`, `FALSE` (any case) | `true` / `false` |
| Blank | A missing field, or JSON `null` | `null` |
| Error | Produced by the formula, not written as a literal | `{"$type":"error","code":"#DIV/0!"}` |

There is no date type. A number is not a date. A formula may return a list or a record. `values * 2` with `[10, 5]` is `[20, 10]`. A record used in arithmetic is `#VALUE!`.

## Names and nested fields

Names are case-sensitive. `price` and `Price` are different keys. `A1` is a name too, not a cell. `A1:B2` is a parse error.

```text
price * qty
```

A dotted name uses an exact key when one exists. Otherwise it walks nested records and lists.

```text
price * qty * nested.price
```

```json
{ "price": 10, "qty": 3, "nested": { "price": 10 } }
```

That formula is `300`. If the context also has `"tax.rate": 0.2` and `"tax": { "rate": 0.1 }`, then `tax.rate` is `0.2`. The exact key wins.

Walking a list builds an array. `orders.price * orders.qty` multiplies the arrays element by element. `orders.price * 2` multiplies every price by 2. The two arrays must be the same length. `SUM` of that array adds the numbers and skips text. `SUM(orders.price * orders.price)` is the sum of squares. `SUM(orders)` is `#VALUE!` because the values are records.

A missing name is blank by default, so `missing + 1` is `1`. In strict mode the same formula is `#REF!`. A path through blank stays blank. A path into a number or string, such as `price.amount` when `price` is `5`, is `#VALUE!`.

## Operators

From tightest to loosest: unary `+` and `-`, then `%`, then `^`, then `*` `/`, then `+` `-`, then `&`, then comparisons. Every binary operator associates left to right, including `^`.

| Formula | Result | Why |
|---------|--------|-----|
| `2^3^2` | `64` | `(2^3)^2`, not `512` |
| `-2^2` | `4` | `(-2)^2` |
| `10%` | `0.1` | `10 * 0.01` |
| `-10%` | `-0.1` | percent applies after unary minus |
| `10%^2` | `0.01` | `(10%)^2` |
| `1<2<3` | `FALSE` | `(1<2)<3` → `TRUE<3`, and booleans sort after numbers |

Arithmetic converts booleans and numeric text. `"3"+1` is `4`. `TRUE+1` is `2`. Blank becomes `0`. `"10%"+1` is `#VALUE!` (percent is syntax, not a string format). `"$1,000"` is not a number. Division by zero and `0^-1` are `#DIV/0!`. `0^0` and a negative number raised to a non-integer power are `#NUM!`.

`&` concatenates. Blank becomes `""`. `TRUE` becomes `"TRUE"`.

`=` and `<>` do not convert types. `"3"=3` is `FALSE`. `TRUE=1` is `FALSE`. Blank equals `0`, `""`, and `FALSE`. String equality ignores the case of `A`–`Z` only.

`<`, `>`, `<=`, and `>=` also do not convert unlike types. The order is **number < string < boolean**. `"3">2` is `TRUE` because every string is greater than every number. `TRUE>1` is `TRUE`.

## Errors

| Code | Typical cause |
|------|----------------|
| `#DIV/0!` | Division by zero, `0` to a negative power, or `AVERAGE` of no numbers |
| `#VALUE!` | Failed conversion, a record or list used as a scalar, wrong number of arguments |
| `#REF!` | A missing name in strict mode |
| `#NAME?` | Unknown function. A missing field is not `#NAME?` |
| `#NUM!` | Numeric domain error or a non-finite result |
| `#N/A` | Not produced yet. `IFNA` can replace it |

`IF` and `IFERROR` do not evaluate the unused branch. `AND` and `OR` evaluate every argument.

A thrown host error is not one of these codes. A leading `=`, an empty argument (`IF(TRUE,,1)`), a formula that is too long, or a list that is too large aborts evaluation.

## Functions

Names are case-insensitive. There must be no space before `(`. At least the arguments shown as required must be present. An empty argument slot is a parse error.

In an **array**, text and booleans are often ignored. A **direct** argument (a literal, a name that is one value, or an expression that is one value) is converted instead. `SUM(TRUE)` is `1`. `SUM(flag)` when `flag` is `TRUE` is `1`. `SUM` of an array that contains `TRUE` skips that boolean.

### Logic

| Function | Behavior |
|----------|----------|
| `IF(condition, if_true[, if_false])` | `IF(FALSE, 1)` is `FALSE`. A blank condition is false. A string condition is `#VALUE!`. |
| `AND(arg1, …)` / `OR(arg1, …)` | At least one argument. In an array, non-numeric text and blanks are ignored. A direct value that is not true or false is `#VALUE!`. |
| `NOT(arg)` | One scalar. |
| `IFERROR(value, if_error)` | Returns `if_error` when `value` is any error. |
| `IFNA(value, if_na)` | Replaces only `#N/A`. |

### Aggregates

| Function | Behavior |
|----------|----------|
| `SUM(arg1, …)` | Adds numbers. Skips blanks. Text and booleans inside an array are skipped. Direct text must be numeric. `SUM(values * values)` is the sum of squares. `SUM(values * 2)` multiplies every element by 2, then adds. |
| `AVERAGE(arg1, …)` | Mean of the same numbers `SUM` would add. No numbers is `#DIV/0!`. |
| `MIN(arg1, …)` / `MAX(arg1, …)` | Same membership as `SUM`. No numbers is `0`. |
| `COUNT(arg1, …)` | In an array, only numbers. A direct boolean counts, and direct numeric text counts. Errors are skipped, not returned. `COUNT(TRUE, "3", 1)` is `3`. |
| `COUNTA(arg1, …)` | Counts everything that is not blank, including text, booleans, and errors. `""` counts. |
| `PRODUCT(arg1, …)` | Multiplies with the same membership as `SUM`. No numbers is `0`, not `1`. |

`SUMIF`, `COUNTIF`, and `AVERAGEIF` are not implemented.

### Text and rounding

| Function | Behavior |
|----------|----------|
| `LEN(text)` | Length in UTF-16 code units. |
| `LEFT(text[, n])` / `RIGHT(text[, n])` | `n` defaults to `1`. Negative `n` is `#VALUE!`. |
| `MID(text, start, n)` | `start` is 1-based. `start < 1` is `#VALUE!`. |
| `CONCAT(arg1, …)` | Appends values. Blank becomes `""`. `CONCATENATE` is the same function. |
| `ROUND(number, digits)` | Half away from zero, on the 15-significant-digit decimal. `ROUND(2.675, 2)` is `2.68`. Negative `digits` rounds to tens, hundreds, and so on. |
| `ROUNDUP` / `ROUNDDOWN` | Away from zero / toward zero, same decimal rule. |
| `INT(number)` | Toward `-∞`. |
| `TRUNC(number[, digits])` | Toward zero. `digits` defaults to `0`. |

## Records

Calculate (`map`) evaluates the formula on each record and returns the list of values, including errors.

Query (`filter`) keeps the record when the formula is `TRUE`. `0`, `FALSE`, and blank drop the record. An error or a string raises a row host error unless the caller chooses to exclude that row.

Aggregate evaluates each aggregate argument once per record, then applies that function's list rules.

```text
aggregate("SUM(price * qty)", [{"qty": 3}, {"price": 9.99, "qty": 3}]) → 29.97
```

The first record has no `price`, so that product is `0`. The second is `9.99 * 3`. Both records with `price` `9.99` would be `59.94`, not `59.8`.

`SUM(orders.price * orders.qty)` is the same kind of total when `orders` is an array of records on one object. Text in a product, such as `"n/a" * 4`, is `#VALUE!`.

`SUM(orders.price)` when `orders` is already a list is summed once, even inside Aggregate. It is not repeated for every outer record.

A formula with no aggregate, in Aggregate mode, does not see the records. Use Calculate for `price * qty` on each row.

## Not in this revision

Sheets, `A1:B2` ranges, `SUMSQ`, `SUMPRODUCT`, dates, `VLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`, `SUMIF`, and `COUNTIF`. `filter`, `map`, and `SUMX` as formula functions are still proposed; the playground Calculate and Query buttons call the library methods of those names.
