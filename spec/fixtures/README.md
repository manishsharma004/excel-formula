# Shared fixtures

JSON cases for [SPEC.md](../SPEC.md) revision **0.3.0**. See §15.2 for the file shape.

| Directory | Required when |
|-----------|----------------|
| `tier0/` | Implementation advertises Tier 0 |

`expected` uses the JSON value encoding in spec §7.2. Compare non-integer numbers with absolute tolerance `1e-9` unless a fixture sets `tolerance`.
