# Implementation task list

Spec: [`spec/SPEC.md`](spec/SPEC.md) **0.5.0**. Design thread: [issue #4](https://github.com/manishsharma004/excel-formula/issues/4).

Both language packages are stubs (`Evaluator.evaluate` throws). Shared fixtures already exist:

| Directory | Count | Required for |
|-----------|------:|--------------|
| `spec/fixtures/tier0/` | 31 | Tier 0 conformance |
| `spec/fixtures/tier1/` | 1 | Tier 1 |
| `spec/fixtures/proposed/records/` | 45 | Proposed §12.5 (records, query, aggregates) |
| `spec/fixtures/proposed/excel-open/` | 4 | Open questions — do **not** implement these as if they were decided |

Do not implement the four `excel-open` cases. They disagree with the current spec on purpose (15-digit number text and equality, `SUM(A1)` range rules, `#NAME?` for a strict missing name).

## Order

```text
0. Shared fixture runner
1. TypeScript package — Tier 0, then Tier 1, then §12.5 and §12.4
2. Python package — same slices, same fixtures, no new semantics
3. Playground — after Tier 0 evaluate works in both; records UI after §12.5
```

A slice is done only when **both** languages pass the same fixtures. Suggested commits: one slice at a time, fixtures unchanged unless the spec changes with them.

---

## 0. Shared fixture runner

- [ ] **0.1 Runner contract.** A small script (or one module per language) reads every `spec/fixtures/**/*.json` except `proposed/`.
  - Compare with §7.2 encoding and §15.2 tolerance (`1e-9` absolute unless `"tolerance": 0`).
  - Host errors must match `{"$type":"host","kind":...}` and must be thrown, not returned.
  - Skip a file when `"skip"` is set.
- [ ] **0.2 Wire it into both test commands** so `npm test` and `pytest` fail on the first mismatched fixture, and print the fixture id.
- [ ] **0.3 Proposed fixtures stay opt-in** (`--proposed` or a separate script). Default CI runs `tier0/` and, once advertised, `tier1/`.

---

## 1. TypeScript package (`typescript/`, `@excel-formula/core`)

Target: a dependency-free package that runs in Node and in the browser. No Node built-ins in `src/`. Keep the public import path `@excel-formula/core`.

### 1.1 Types and errors

- [ ] **TS-1 Value types** from §7.1: number, string, boolean, blank (`null`), error (`{ code }`). No `NaN` or infinity escapes an operation.
- [ ] **TS-2 Host errors** from §10: `parse`, `limit`, `timeout`, `unsupported`, `config`, `function`, `row`. Distinct classes, not Excel error values.
- [ ] **TS-3 Options** from §4.2: `strict`, `maxFormulaLength` (UTF-16 code units), `maxAstNodes`, `maxFunctionArgs`, `maxRangeCells`, `timeoutMs`. `referenceStyle !== "A1"` and `formulaLocale !== "en-US"` throw `unsupported`.
- [ ] **TS-4 JSON codec** for fixtures: `$type: number | error | host`. A context object or array is a non-scalar (§7.2) until §12.5.

### 1.2 Parser (spec §5)

- [ ] **TS-5 Lexer.** Whitespace, numbers (the §5.1 regex, including `1.` and `.5`, not a lone `.`), strings with `""`, booleans, identifiers as dot-separated segments, cell tokens, operators, punctuation.
- [ ] **TS-6 Cell vs name vs call.** `A1` is always a cell. `LOG10(100)` is a call. `LOG10` alone is the cell. Out-of-range cells (`ZZZ1`, `A0`, row above 1048576, column after `XFD`) parse as cells and later return `#REF!`.
- [ ] **TS-7 Grammar.** Precedence and associativity from §5.2. `^` is **left**-associative (`2^3^2` = 64). Unary minus tighter than `^` (`-2^2` = 4). `%` tighter than `^`.
- [ ] **TS-8 Rejected syntax.** Leading `=` is `parse`. Empty argument slots (`IF(TRUE,,1)`) are `parse`. Space between ranges is `parse`. `!` is not a token.
- [ ] **TS-9 Limits at parse.** `maxFormulaLength`, `maxAstNodes`.

### 1.3 Evaluator core (spec §6–§11, §13)

- [ ] **TS-10 Names.** Case-sensitive exact keys. Flat dotted keys (`"tax.rate"`) match the whole token.
- [ ] **TS-11 Cells.** `$` ignored, column uppercased, key `A1` only. Missing key: blank when `strict` is false, `#REF!` when true.
- [ ] **TS-12 Ranges.** Normalize reversed corners, row-major order, `maxRangeCells`. A range is legal only as a function argument; `A1:A2+1` is `#VALUE!`.
- [ ] **TS-13 Coercion** §8.1–§8.3. `"10%"` does **not** become a number. `"3"+1` is `4`.
- [ ] **TS-14 Equality** §8.4. No cross-type coercion: `"3"=3` is false, `TRUE=1` is false. Blank equals `0`, `FALSE`, and `""`.
- [ ] **TS-15 Ordered compare** §8.5. Type order number < text < boolean. Blank takes the other side’s empty value. `"1">2` and `TRUE>1` are true. `1<2<3` is false.
- [ ] **TS-16 Operators** §13, including `0^0` → `#NUM!` and `0^-1` → `#DIV/0!`.
- [ ] **TS-17 Evaluation order** §11. `IF` does not evaluate the unused branch. `AND` / `OR` evaluate every argument.

### 1.4 Tier 0 functions (spec §12.1) — conformance gate

- [ ] **TS-18** `IF` (2 or 3 args), `AND`, `OR`, `NOT`, `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`.
- [ ] **TS-19 Direct vs range.** A name and a single cell are **direct** in this revision (`SUM(flag)` with `flag` true is `2` when added to `1`). Range rules differ: text and booleans inside `A1:A2` are ignored by `SUM`; `COUNT` ignores errors in a range and also ignores a direct error (`COUNT(1, 1/0)` is `1`).
- [ ] **TS-20 All 31 `tier0/` fixtures pass.**

### 1.5 Tier 1 (spec §12.2)

- [ ] **TS-21** `IFERROR`, `IFNA`, `LEN` (UTF-16 code units, not code points), `LEFT`, `RIGHT`, `MID`, `CONCAT` / `CONCATENATE`.
- [ ] **TS-22** `ROUND`, `ROUNDUP`, `ROUNDDOWN` on the 15-significant-digit decimal value (`ROUND(2.675, 2)` is `2.68`), `INT`, `TRUNC`.
- [ ] **TS-23** `tier1/round-decimal-half` passes. Add the rest of the Tier 1 cases as you implement each function; a new fixture is a spec change only when it changes a rule.

### 1.6 Records, lists, and query mode (spec §12.5, Proposed)

The product requirement is agreed (§2.1). Implement this section as written. Do not add grouping or element-wise array arithmetic (§12.5.7 items 5 and 6).

- [ ] **TS-24 Values.** Records and lists at any depth. Exact dotted key wins over path walking. `orders.price` is a column. Nested lists flatten one level per hop. Paths through blank stay blank. Paths into a scalar are `#VALUE!`. A record or list is never a top-level result.
- [ ] **TS-25 Scope.** Row, then outer rows, then root. A key present with `null` does not fall through.
- [ ] **TS-26 Aggregates accept columns and scalar lists** with the same membership rules as ranges. `SUM(orders)` is `#VALUE!`.
- [ ] **TS-27** `COUNTROWS`, `FILTER`, `SUMX`, `AVERAGEX`, `MINX`, `MAXX`, `COUNTX`, `COUNTAX`, using parameter kinds `list` and `perRow` (not `lazy`: the row formula runs once per record).
- [ ] **TS-28** `filter`, `map`, `compile`. `onRowError` `"raise"` (host `row`) and `"exclude"`. `maxRows`. `cellReferences: false` reads `q1` as a name.
- [ ] **TS-29** All 45 `proposed/records/` fixtures pass under the opt-in runner.

### 1.7 Custom functions (spec §12.4, Proposed)

Needed by the playground setup script. Implement the registry; leave async and `LAMBDA` deferred.

- [ ] **TS-30** One registry. Builtins and custom functions share it. `functions` and `builtins` options. Name collision without `override: true` is host `config` at construction.
- [ ] **TS-31** Parameter kinds: `number`, `string`, `boolean`, `scalar`, `values`, `range`, `lazy`, `list`, `perRow`. Wrong arity is `#VALUE!` and does not call the function.
- [ ] **TS-32** Contract. Sync only. No context object passed in. A thrown exception is host `function`, not `#VALUE!`. A non-value return is host `function`.
- [ ] **TS-33** `listFunctions()`. Volatile flag plus injectable `clock` can wait until the first volatile builtin.

---

## 2. Python package (`python/`, import `excel_formula`)

Same public behavior as the TypeScript package. Do not start a function until the matching TS task exists, so the fixture runner is the diff.

- [ ] **PY-1** Mirror TS-1–TS-4. Blank is `None`. Errors are a small `ExcelError` value, not an exception. Host failures subclass `EvaluationError` and carry `kind`.
- [ ] **PY-2** Parser, same grammar and rejections as TS-5–TS-9. Pure Python, no native extensions, so Pyodide can load it.
- [ ] **PY-3** Evaluator core, TS-10–TS-17. `LEN` and formula length count UTF-16 code units, not `len()` of the `str`.
- [ ] **PY-4** Tier 0 functions. All 31 `tier0/` fixtures pass (PY matches TS).
- [ ] **PY-5** Tier 1, including decimal `ROUND` via the 15-digit decimal value (use `decimal` or an equivalent; do not scale the raw float by 100).
- [ ] **PY-6** §12.5 records, lists, `filter` / `map` / `compile`, row-scoped functions. All 45 record fixtures pass.
- [ ] **PY-7** §12.4 registry. Field names may be `max_formula_length` in Python and `maxFormulaLength` in TypeScript; meanings match §4.2.
- [ ] **PY-8** Build a wheel (`python -m build`) with no dependencies beyond the stdlib, so the playground can `micropip.install` it.

---

## 3. Playground

New app, for example `playground/`. Frontend only: no evaluation server. It loads the built npm package and, in the Python tab, the wheel through Pyodide.

### 3.1 Shell

- [ ] **PG-1** Vite (or equivalent) app. Two tabs: **JavaScript / TypeScript** and **Python**. The tab is the language of the setup script and of the engine. The formula language is the same Excel expression in both.
- [ ] **PG-2** Persist the session in `localStorage`: tab, formula, test data, data shape, setup script, options (`strict`, `cellReferences`, `onRowError`).
- [ ] **PG-3** Show spec revision `0.5.0` and a short note that Proposed behavior (§12.5, custom functions) depends on those tasks being done.

### 3.2 Editors (Monaco)

Use `monaco-editor` for every text surface. No textarea fallbacks for the formula, data, or setup script.

- [ ] **PG-4 Formula editor.** Language: a small Monarch tokenizer for this spec (strings, cells, names, functions), not full Excel. Run on edit, debounced.
- [ ] **PG-5 Test-data editor.** JSON, with schema markers so invalid JSON is shown inline and Run stays disabled.
- [ ] **PG-6 Setup-script editor.** Language follows the tab: JavaScript, TypeScript, or Python.
- [ ] **PG-7 Result view.** Read-only Monaco (JSON). Errors show the Excel code (`#VALUE!`) or the host kind (`parse`, `row`) plus the message.

### 3.3 Test data: one record and many records

- [ ] **PG-8 Shape control** with two modes:
  - **Single record** — JSON object. Run uses `evaluate(formula, record)`. Disabled, with an explanation, when the formula calls an aggregate (`SUM`, `SUMX`, `FILTER`, …), because those need a list.
  - **Array of records** — JSON array. Run offers **Calculate** (`map`), **Query** (`filter`, show the kept records), and **Aggregate** (`evaluate` with the array bound to a name, default `rows`, so the formula can say `SUM(rows.price)` or `SUMX(rows, price * qty)`).
- [ ] **PG-9 Examples.** One-click samples: the four-order table from `spec/fixtures/proposed/README.md`, a single order, and an empty array. Examples are inserted into the data editor; they are not a second hidden context.
- [ ] **PG-10 Non-aggregate formulas work both ways.** `price * qty` on a single record shows one number. The same formula on an array, in Calculate mode, shows one value per row. Query mode keeps rows whose result is true. Document `onRowError` in the UI (`raise` vs `exclude`).

### 3.4 Custom setup script

The script runs in the page **before** the formula. It may register custom functions and replace or wrap the test data. It is not a sandbox: say so in the UI. Anyone who can edit the script can run it.

- [ ] **PG-11 JavaScript setup.** The script is a function body that receives `{ evaluator, data, formula }` and may return `{ data, formula }`. Custom functions are registered on the evaluator (`evaluator.functions` / the §12.4 API from TS-30).
- [ ] **PG-12 TypeScript setup.** Same contract. Transpile in the browser with `typescript` (`transpileModule`, `target` ES2022, `module` ESNext) and surface diagnostics in the editor. The user can switch JS/TS without leaving the tab.
- [ ] **PG-13 Python setup.** The script is a function `setup(evaluator, data, formula) -> dict | None` defining the same keys. Custom functions use the Python registry (PY-7). Failures show the Python traceback in the result view, separate from formula errors.
- [ ] **PG-14 Order of a run.** Parse data → run setup → evaluate / filter / map → render. A setup exception does not call the formula.

### 3.5 Python tab (Pyodide, frontend only)

- [ ] **PG-15** Load Pyodide from a pinned CDN or vendored build. Show a loading state; don’t fetch it until the Python tab is opened.
- [ ] **PG-16** Install the local wheel with `micropip`. Pin the Pyodide and wheel versions in the playground README.
- [ ] **PG-17** Call `excel_formula.Evaluator` inside Pyodide for Run. Pass data in with `toPy`, read results out with `toJs`. Map `ExcelError` and host exceptions to the same result JSON the JS tab shows, so the two tabs are comparable.
- [ ] **PG-18** No network after load, and no Python backend. Formula text is not sent anywhere except the in-browser engine and, if enabled, the on-device model below.

### 3.6 Code completion with Chrome’s built-in AI

Use the [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) (`LanguageModel`), which runs a model **on device** in Chromium. Do not call a cloud model.

- [ ] **PG-19 Feature detect.** `globalThis.LanguageModel?.availability()`. If the API is missing, or availability is `"unavailable"`, editors work with no completions and the UI says why (not Chrome, or the model is not available on this device).
- [ ] **PG-20 Download state.** If availability is `"downloadable"`, offer an explicit **Download model** button. Do not start the download on page load. If `"downloading"`, show progress from `create({ monitor })`.
- [ ] **PG-21 Inline completions in Monaco** via `registerInlineCompletionsProvider` for the formula, the test-data JSON, and the setup script (JS, TS, and Python). Debounce, cancel on `token.onCancellationRequested`, and cap the prompt (prefix, suffix, a one-line description of the spec subset, and the names in the current test data).
- [ ] **PG-22 Session reuse.** One `LanguageModel` session, recreated when the language changes. System instructions name the active editor: Excel expression, JSON records, or a setup script in JS, TS, or Python. Completions are inserts, not chat replies.
- [ ] **PG-23 Toggle.** Completions default **off** until the user turns them on, so a missing model never blocks editing. The toggle is per browser, stored locally.

### 3.7 Playground checks

- [ ] **PG-24** Manual script, written in `playground/README.md`: JS and TS setup both register a function and the formula calls it; Python does the same; single-record `price * qty` and array `filter` / `map` / `SUM` match between tabs; completion toggle degrades cleanly when `LanguageModel` is absent.
- [ ] **PG-25** `npm test` for the playground covers the data-shape rules (aggregate formula rejects a single record; non-aggregate allows both) without loading Pyodide or Chrome AI.

---

## Out of scope for this list

- Tier 2 lookups and dates, dynamic arrays, `LAMBDA` / `LET`, workbook mode, locales other than `en-US` (spec §1, §12.3).
- The four `excel-open` fixtures, until issue #4 closes those questions.
- Publishing to npm or PyPI (package names are still open, spec §16).
- A Python backend for the playground. Python runs in Pyodide only.

## Done when

1. Both packages report `specRevision` `0.5.0` and pass `tier0/` and `tier1/`.
2. Both pass `proposed/records/` with the opt-in runner.
3. The playground’s two tabs run the same formula on one record and on an array of records, run a custom setup script in JavaScript, TypeScript, and Python, edit those surfaces in Monaco, and offer on-device completions where Chrome’s Prompt API is available.
