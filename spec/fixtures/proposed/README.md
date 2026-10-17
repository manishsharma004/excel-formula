# Proposed fixtures (non-normative)

Draft JSON cases for [`REVIEW.md`](../../REVIEW.md). **Not** part of Tier 0 conformance until promoted into `SPEC.md` and moved under `tier0/` (or a new tier directory).

| Subdirectory | Contents |
|--------------|----------|
| `records/` | Records, columns, `filter`/`map` modes, Tier R aggregations |
| `excel-corrections/` | Cases that differ from current spec but match Excel |

Many `records/` cases assume options not yet in the spec (e.g. `cellReferences: false`, `onRowError`).
