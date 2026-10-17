# Shared fixtures

JSON cases for [SPEC.md](../SPEC.md) revision **0.8.0**. See §15.2 for the file shape.

| Directory | Cases | Required when |
|-----------|------:|---------------|
| `tier0/` | 54 | Implementation advertises Tier 0 |
| `tier1/` | 1 | Implementation advertises Tier 1 |
| `proposed/` | 47 | **Never.** Draft cases for Proposed (§12.5) and Open behavior. Runners MUST NOT count them toward conformance. See [`proposed/README.md`](proposed/README.md) for every case explained. |

`expected` uses the JSON value encoding in spec §7.2. Compare non-integer numbers with absolute tolerance `1e-9` unless a fixture sets `tolerance`.

Proposed fixtures may include `"mode": "evaluate" | "filter" | "map"` and `"rows"` (spec §12.5.6). Tier fixtures do not use those fields.
