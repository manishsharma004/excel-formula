# excel-formula

Language-neutral libraries for **evaluating Excel-style formulas** against an in-memory **context** (typically a `dict` / object mapping names or cell references to values).

This repository is a **multi-module monorepo**: one shared specification, multiple language implementations that should behave consistently.

## Status

**Early design phase.** Behavior is not finalized. See:

- [`spec/SPEC.md`](spec/SPEC.md) — draft language-neutral specification (source of truth for implementations)
- [**Design discussion (issue #4)**](https://github.com/manishsharma004/excel-formula/issues/4) — canonical thread for spec decisions
- [`spec/DISCUSSION_ISSUE.md`](spec/DISCUSSION_ISSUE.md) — design thread mirror (keep in sync with [#4](https://github.com/manishsharma004/excel-formula/issues/4); spec **0.5.0**)
- [`spec/REVIEW.md`](spec/REVIEW.md) — design review: records and query model, Excel-compat findings and their status

## Modules

| Path | Language | Purpose |
|------|----------|---------|
| [`python/`](python/) | Python | Evaluate formulas on a `dict` context |
| [`typescript/`](typescript/) | TypeScript | Evaluate formulas on a `Record` / object context |

Implementations are stubs until the spec stabilizes.

## Repository layout

```
spec/           # Language-neutral specification and decision log
python/         # Python package (excel_formula)
typescript/     # TypeScript package (@excel-formula/core)
```

## Contributing

Propose changes to `spec/SPEC.md` via PR and discuss open questions in [#4](https://github.com/manishsharma004/excel-formula/issues/4) before locking API or semantics.

## License

MIT — see [LICENSE](LICENSE).
