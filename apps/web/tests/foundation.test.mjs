import assert from "node:assert/strict";
import test from "node:test";

import webPackage from "../package.json" with { type: "json" };

test("web workspace exposes required quality scripts", () => {
  for (const script of ["build", "lint", "typecheck", "test"]) {
    assert.equal(typeof webPackage.scripts[script], "string");
  }
});
