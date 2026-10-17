import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Evaluator, HostError, SPEC_REVISION } from "../src/evaluator.js";

describe("Evaluator", () => {
  it("exposes spec revision 0.8.0", () => {
    assert.equal(Evaluator.specRevision, SPEC_REVISION);
    assert.equal(SPEC_REVISION, "0.8.0");
  });

  it("rejects a leading equals sign", () => {
    const ev = new Evaluator();
    assert.throws(() => ev.evaluate("=1+1", {}), (e: unknown) => {
      assert.ok(e instanceof HostError);
      assert.equal(e.kind, "parse");
      return true;
    });
  });

  it("evaluates a name expression", () => {
    const ev = new Evaluator();
    assert.equal(ev.evaluate("price * qty", { price: 9.99, qty: 3 }), 29.97);
  });
});
