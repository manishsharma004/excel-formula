# Design discussion (mirror of issue #4)

**Canonical thread:** https://github.com/manishsharma004/excel-formula/issues/4

This file tracks the issue body for version control. When the issue is updated on GitHub, sync here (or vice versa).

---

## Summary

This is the **canonical design thread** for [excel-formula](https://github.com/manishsharma004/excel-formula): a language-neutral **spec** plus **Python** and **TypeScript** libraries that evaluate Excel-style expressions against an in-memory mapping (dict / object).

**Active spec:** [`spec/SPEC.md`](./SPEC.md) revision **0.4.0** on `main` ([#5](https://github.com/manishsharma004/excel-formula/pull/5) + [#6](https://github.com/manishsharma004/excel-formula/pull/6) merged). Implementations under `python/` and `typescript/` are **stubs** until we lock semantics here.

## Problem statement

```text
evaluate("price * qty", { "price": 9.99, "qty": 3 }) → 29.97
```

…extended to a documented subset of Excel functions, errors, and coercion — **without** Excel at runtime. Python and TypeScript MUST match on shared fixtures under `spec/fixtures/`.

## Agreed

### Formula input — no leading `=`

`evaluate` takes **expression strings only** (e.g. `price * qty`, `SUM(a, b)`). A leading `=` is a **parse error** (spreadsheet UI only). See spec §2.1, §5.4.

### Single-shot evaluation

Context values are **data**. A string `"price*qty"` in the context is not evaluated as a formula (spec §6.6).

## Spec progress (informative)

| Revision | Highlights |
|----------|------------|
| 0.2.0 | Grammar, coercion, Tier 0 functions, limits, fixtures |
| 0.3.0 | §17 use cases, corner-case catalog, existing engines |
| 0.4.0 | **§12.4 proposed:** extensibility for **additional functions** (registry, parameter kinds, packs, security) |

## Extensibility — please discuss (§12.4, Proposed)

We need a way to add functions beyond the spec tiers without forking the evaluator.

**Proposal summary:**

1. **One registry** — builtins and `ACME.TAX`-style custom functions use the same registration API; builtins must be expressible with that API.
2. **Options** — `functions: [...]`, `builtins: ["0"] | "all"` to limit surface for untrusted formulas.
3. **Parameter kinds** — `number`, `string`, `boolean`, `scalar`, `values` (range vs direct tagging), `range`, `lazy` (for `IF`-style branching).
4. **Naming** — custom functions SHOULD use dotted names (`ACME.TAX`); undotted names reserved for spec functions.
5. **Contract** — sync only; no whole-context access; thrown errors → host `function` error (not `#VALUE!`) — **is this right?**
6. **Volatile** — `TODAY`/`NOW` use injectable `clock` for tests.
7. **Packs** — versioned multi-language function sets ship their own fixtures.

Full text: spec **§12.4** and open questions **§12.4.11**.

## Review findings (2026-10-17, [`spec/REVIEW.md`](./REVIEW.md))

Full write-up and **59 draft fixtures** in [`spec/fixtures/proposed/`](./fixtures/proposed/). Summary for [#4](https://github.com/manishsharma004/excel-formula/issues/4):

### Product requirement: records + query + calculation

- **Aggregations** should accept **lists of records** and **columns** (projected fields), not only cell ranges.
- A **non-aggregate formula** (e.g. `price * qty`, `region = "EU"`) should work as:
  - **calculation** — `evaluate(formula, oneRecord)`;
  - **query** — `filter(formula, rows)`;
  - **calculated column** — `map(formula, rows)`.
- Current spec **blocks** this (§4.1 opaque nested objects, §7.1 no list type, §17.4 refuses arrays). REVIEW proposes **Tier R**: `SUMX` / `FILTER` / `COUNTROWS`, scope stack, `filter`/`map`/`compile` API, and `cellReferences` default off for JSON field names like `q1`.

### High-severity Excel-compat bugs in current spec (fix before locking Tier 0)

| Item | Spec / fixture today | Excel |
|------|----------------------|-------|
| `"3"=3` | `TRUE` (`equality-numeric-string`) | `FALSE` |
| `^` associativity | right | **left** (`2^3^2` → 64) |
| Ordered compare §8.5 | coerces strings to numbers | type order only (`"1">2` → `TRUE`) |
| `1<2<3` | implied `TRUE` | `FALSE` |
| `COUNT(TRUE,"3",1)` | 1 | 3 |
| `0^-1` | `#NUM!` | `#DIV/0!` |
| `IF(FALSE,1)` | arity error | `FALSE` |

See REVIEW **Part B** for the full list (27 items) and **Part C** for behavior tables.

### Suggested positions on open checkboxes

- Context: **names + records/lists**; cells **opt-in** (`cellReferences`) because `q1` is parsed as cell `Q1`.
- First release: **Tier 0 + Tier R** (records/query), not only scalar dict rules.
- §12.4: keep **host `function` error** on throw; **require `lazy`** in the public API for `SUMX`/`FILTER`.

## Still open (please comment on GitHub #4)

- [ ] **Records / query / Tier R** — adopt REVIEW Part A in `SPEC.md`? (scope fallback, bracket keys, grouping deferred?)
- [ ] **Excel-compat corrections** — apply REVIEW Part B (will change tier0 fixtures)?
- [ ] Context model: names only, cells only, or hybrid? (Spec currently: **hybrid flat map**, §6.1; REVIEW: hybrid + records)
- [ ] Missing keys: blank (lax) vs `#REF!` (strict) — spec §6.4; keep?
- [ ] Dates / serial numbers when Tier 2 lands
- [ ] Locale beyond `en-US`
- [ ] Workbook mode (formulas in context values + dependency graph) — defer?
- [ ] Tier 1 required for first release, or Tier 0 only?
- [ ] **§12.4.11** — custom function throws → host error vs `#VALUE!`? allow builtin `override`? async ever? `LAMBDA` in formula text as second extension path?

## Next steps

1. Comment on **§12.4** and the open checkboxes on [issue #4](https://github.com/manishsharma004/excel-formula/issues/4).
2. Lock decisions in `spec/SPEC.md` via PRs that reference this issue.
3. Implement Tier 0 only after the relevant items are agreed.
