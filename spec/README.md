# Specification

[`SPEC.md`](SPEC.md) is the **single source of truth** for what every language implementation must do.

- **Draft status:** revision **0.7.0** is a normative proposal. Nested paths, `aggregate`, `PRODUCT`, `SUMSQ`, and `SUMPRODUCT` are required. Sections marked **Proposed**, **Open**, or **Deferred** are not required yet. §12.4 proposes how to add functions; §12.5 proposes records, lists, and query mode; §17 records use cases, corner cases, deliberate deviations from Excel, and existing engines.
- **Versioning:** the spec carries a `Status` and `Revision` at the top; implementations should cite which revision they target.
- **Changes:** debate in [issue #4](https://github.com/manishsharma004/excel-formula/issues/4), then change `SPEC.md` with a reference to that issue.

Shared cases: [`fixtures/`](fixtures/). Conformance fixtures are in `tier0/` and `tier1/`.

Design review (records and query model, Excel-compat corrections, status of each finding): [`REVIEW.md`](REVIEW.md). Draft cases for Proposed and Open behavior, each one explained: [`fixtures/proposed/`](fixtures/proposed/).
