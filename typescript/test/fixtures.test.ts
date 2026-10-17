import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Evaluator, HostError } from "../src/evaluator.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "../../spec/fixtures");

type Fixture = {
  id: string;
  formula: string;
  context?: Record<string, unknown>;
  rows?: unknown[];
  mode?: string;
  options?: { strict?: boolean; tolerance?: number };
  expected: unknown;
  skip?: string;
  tolerance?: number;
};

function loadDir(name: string): Fixture[] {
  const dir = join(fixturesRoot, name);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Fixture);
}

function same(actual: unknown, expected: unknown, tolerance: number): boolean {
  if (typeof expected === "number" && typeof actual === "number") {
    if (tolerance === 0) return Object.is(actual, expected) || actual === expected;
    return Math.abs(actual - expected) <= tolerance;
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function runDir(name: string): void {
  describe(name, () => {
    for (const fx of loadDir(name)) {
      it(fx.id, () => {
        if (fx.skip) return;
        const ev = new Evaluator({ strict: fx.options?.strict ?? false });
        const tol = fx.tolerance ?? fx.options?.tolerance ?? 1e-9;
        const expected = fx.expected as { $type?: string; kind?: string };
        if (expected && typeof expected === "object" && expected.$type === "host") {
          assert.throws(() => ev.evaluate(fx.formula, fx.context), (e: unknown) => {
            assert.ok(e instanceof HostError, `${fx.id}: expected host error, got value`);
            assert.equal(e.kind, expected.kind, fx.id);
            return true;
          });
          return;
        }
        let actual: unknown;
        try {
          actual = fx.mode === "aggregate"
            ? ev.aggregate(fx.formula, fx.rows ?? [], fx.context ?? {})
            : ev.evaluate(fx.formula, fx.context ?? {});
        } catch (e) {
          assert.fail(`${fx.id} threw ${e instanceof Error ? e.message : e}`);
        }
        assert.ok(same(actual, fx.expected, tol), `${fx.id}: ${JSON.stringify(actual)} !== ${JSON.stringify(fx.expected)}`);
      });
    }
  });
}

runDir("tier0");
runDir("tier1");
