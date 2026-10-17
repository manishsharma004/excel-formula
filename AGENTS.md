# AGENTS.md

## What this repo is

Monorepo for **Excel formula evaluation** on a dictionary/object context, with **one shared spec** (`spec/SPEC.md`) and per-language packages under `python/` and `typescript/`.

Design is still in flux; do not treat stub APIs as stable.

## Layout

- `spec/SPEC.md` — language-neutral requirements and semantics (update here first)
- `python/` — Python package (`excel_formula`), managed with `pyproject.toml`
- `typescript/` — npm package `@excel-formula/core`

## Commands

### TypeScript (`typescript/`)

```bash
cd typescript && npm install && npm run build && npm test
```

### Python (`python/`)

```bash
cd python && python -m pip install -e ".[dev]" && python -m pytest
```

(Dev dependencies and tests are minimal placeholders until spec is agreed.)

## Workflow for agents

1. Read open issues and `spec/SPEC.md` before implementing behavior.
2. Spec changes and code changes should land together when semantics change.
3. Cross-language parity: add the same scenario to shared test vectors in `spec/fixtures/` when that directory exists.

## Cursor Cloud

No special services required. Static docs + library code only.
