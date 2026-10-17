import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Evaluator, SPEC_REVISION } from "../src/evaluator.js";

describe("Evaluator stub", () => {
  it("exposes spec revision", () => {
    assert.equal(Evaluator.specRevision, SPEC_REVISION);
  });

  it("evaluate is not implemented yet", () => {
    const ev = new Evaluator();
    assert.throws(() => ev.evaluate("=1+1", {}), /not implemented/i);
  });
});
