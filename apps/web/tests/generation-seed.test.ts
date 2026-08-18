import assert from "node:assert/strict";
import test from "node:test";

import { generationRandomSeed } from "../lib/local/api";

test("each generation attempt gets a different deterministic solver seed", () => {
  assert.equal(generationRandomSeed(0), 1);
  assert.equal(generationRandomSeed(1), 2);
  assert.equal(generationRandomSeed(2), 3);
  assert.equal(generationRandomSeed(2_147_483_646), 1);
});
