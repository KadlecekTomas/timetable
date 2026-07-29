import assert from "node:assert/strict";
import test from "node:test";

import { completionFromSolver } from "../src/protocol.js";

test("successful solver response becomes SOLVED completion", () => {
  const result = completionFromSolver({
    ok: true,
    status: 200,
    body: { status: "FEASIBLE" },
  });
  assert.deepEqual(result, {
    outcome: "SOLVED",
    result: { status: "FEASIBLE" },
  });
});

test("solver 422 becomes INFEASIBLE completion", () => {
  const result = completionFromSolver({
    ok: false,
    status: 422,
    body: { detail: { code: "INFEASIBLE" } },
  });
  assert.equal(result.outcome, "INFEASIBLE");
});

test("unexpected solver failure becomes FAILED completion", () => {
  const result = completionFromSolver({
    ok: false,
    status: 500,
    body: "broken",
  });
  assert.deepEqual(result, {
    outcome: "FAILED",
    error: { httpStatus: 500, message: "Solver vrátil nečitelnou odpověď." },
  });
});
