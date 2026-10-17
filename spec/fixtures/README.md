# Shared fixtures

JSON cases for [SPEC.md](../SPEC.md) revision **0.4.0**. See §15.2 for the file shape.

| Directory | Required when |
|-----------|----------------|
| `tier0/` | Implementation advertises Tier 0 |
| `proposed/` | **Not required** — draft cases from [`REVIEW.md`](../REVIEW.md) (records/query + Excel corrections). Runners SHOULD skip until promoted into a spec revision. |

`expected` uses the JSON value encoding in spec §7.2. Compare non-integer numbers with absolute tolerance `1e-9` unless a fixture sets `tolerance`.

Proposed fixtures may include `"mode": "evaluate" | "filter" | "map"` and `"rows"` (see REVIEW.md Part C). They are not valid conformance cases until `SPEC.md` defines those fields.
