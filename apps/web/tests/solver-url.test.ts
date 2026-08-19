import assert from "node:assert/strict";
import test from "node:test";

import { resolveSolverBaseUrl } from "../lib/solver-url";

test("resolveSolverBaseUrl uses the host solver for local development", () => {
  assert.equal(resolveSolverBaseUrl({}), "http://127.0.0.1:8000");
});

test("resolveSolverBaseUrl uses the public Services deployment on Vercel", () => {
  assert.equal(
    resolveSolverBaseUrl({ VERCEL: "1" }),
    "https://timetable-web-ny6g.vercel.app/solver",
  );
});

test("resolveSolverBaseUrl prefers an explicit deployment configuration", () => {
  assert.equal(
    resolveSolverBaseUrl({
      VERCEL: "1",
      SOLVER_URL: "https://solver.example.test/",
    }),
    "https://solver.example.test",
  );
});
