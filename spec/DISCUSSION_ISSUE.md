## Summary

This issue is the **main design thread** for [excel-formula](https://github.com/manishsharma004/excel-formula): a **language-neutral spec** plus **Python** and **TypeScript** libraries that evaluate Excel-style formulas against an in-memory mapping (dict / object).

An initial draft spec lives in **`spec/SPEC.md`** (revision **0.1.0**). Implementations under `python/` and `typescript/` are **stubs** until we lock semantics here.

## Problem statement

We want one predictable behavior:

```text
evaluate("=price * qty", { "price": 9.99, "qty": 3 }) → 29.97
```

…extended to a documented subset of Excel functions, errors, and coercion rules — **without** requiring Excel itself at runtime.

Different languages should share:

- Reference resolution rules (what keys in the context mean)
- Value types (numbers, strings, booleans, errors, dates)
- Function catalog and tiers
- Shared JSON test fixtures (planned under `spec/fixtures/`)

## Initial analysis

### Why a spec-first monorepo?

- **Parity:** spreadsheet UIs and backends often need the same formula semantics in browser (TS) and server/worker (Python).
- **Testability:** JSON fixtures beat “looks right in Excel” for CI.
- **Scope control:** Excel is huge; a written tier list prevents silent divergence between languages.

### Context model (most important decision)

Three common patterns (see spec §4.2):

| Model | Context example | Typical use |
|-------|-----------------|-------------|
| **A — Cell keys** | `{ "A1": 10, "B1": 20 }` | Grid recalc, importing sheet snapshots |
| **B — Name keys** | `{ "price": 9.99, "qty": 3 }` | Rules, templates, named fields |
| **C — Hybrid** | Both names and `A1` | Full spreadsheet engines |

**Suggestion:** Target **Model B (names)** for **v0**, with optional **A1** addresses (no sheet prefix). Add sheet-qualified refs (`Sheet1!A1`) and hybrid storage once we know if consumers pass nested dicts or flat keys.

### Missing references

Excel often treats empty cells as `0` in arithmetic; strict engines prefer `#REF!` or `null`.

**Suggestion:** Make this **configurable** (`nullReference` option): default to **`#REF!` error value** in strict mode, **`0`** in lax mode (closer to Excel arithmetic). Document in spec before implementing.

### Formulas stored *in* context values

If `context["total"]` is the string `"=price*qty"`, we need either:

1. **Single-shot mode:** only the requested formula is evaluated; context values are opaque, or  
2. **Workbook mode:** evaluator resolves dependencies, detects cycles, order of evaluation.

**Suggestion:** Ship **single-shot** `evaluate(formula, context)` first. Add `evaluate_all` / dependency graph in a later spec revision to avoid blocking v0.

### Function scope

Reimplementing all of Excel is unrealistic. A **tiered** function list (spec §6.2) lets us ship incrementally and tag conformance (`tier0`, `tier1`, …).

**Suggestion for first useful release (Tier 0 + partial Tier 1):**

- Arithmetic + comparisons, `&`, `%`
- `IF`, `AND`, `OR`, `NOT`, `IFERROR`
- `SUM`, `MIN`, `MAX`, `AVERAGE`, `COUNT`, `COUNTA`
- Basic text: `LEN`, `LEFT`, `RIGHT`, `MID`, `CONCAT` / `CONCATENATE`

Defer lookups (`VLOOKUP`/`XLOOKUP`) until context/range rules are clear.

### Parser vs. formula-to-AST

**Suggestion:** Spec should require the same **abstract semantics**, not necessarily the same parser. Both implementations may use:

- A shared grammar document + generated parsers, or  
- Independent parsers validated only via fixtures.

Prefer **shared fixtures** as the contract; keep parser choice per language unless we later add a reference parser in WASM.

### Security (if formulas are user-controlled)

**Suggestion:** Spec should mandate **max formula length**, **max AST depth**, and **evaluation timeout** hooks for server-side use. Browser TS may use lighter limits.

### Prior art (informative)

- JS: formulajs, fast-formula-parser  
- Python: formulas, pycel, xlcalculator  

We can mine their test cases for edge cases once our value model is fixed.

## Proposed next steps

1. **Agree on context model** (name vs cell vs hybrid) and missing-key behavior.  
2. **Freeze value model** for errors and dates (serial number vs ISO string).  
3. Add **`spec/fixtures/tier0/`** with ~20 JSON cases and make both languages pass them.  
4. Choose **Tier 0** function set and operator coercion table (append to spec).  
5. Only then implement parsers/evaluators behind the stub APIs.

## Open questions (please comment)

- [ ] Primary context: names, cells, or hybrid?  
- [ ] Should `evaluate` strip/require leading `=`? (draft: optional strip)  
- [ ] Date literals and `TODAY()` — fixed clock injection for tests?  
- [ ] Locale: English function names only for v0?  
- [ ] Publish packages to PyPI / npm under what names?

---

**Draft spec:** [`spec/SPEC.md`](https://github.com/manishsharma004/excel-formula/blob/cursor-agent/monorepo-spec-setup-3188/spec/SPEC.md) on the setup branch (will merge to `main` with the monorepo scaffold).

/cc @manishsharma004 — feedback welcome on scope and the v0 context model.
