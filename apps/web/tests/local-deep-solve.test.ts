import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_DEEP_SOLVE_SECONDS,
  defaultGenerationTimeLimitForHost,
  isLocalDeepSolveHost,
  maxGenerationTimeLimitForHost,
} from "../lib/local/deep-solve";

test("localhost gets a 30-minute Deep Solve budget", () => {
  assert.equal(isLocalDeepSolveHost("localhost"), true);
  assert.equal(isLocalDeepSolveHost("127.0.0.1"), true);
  assert.equal(defaultGenerationTimeLimitForHost("localhost"), 1_800);
  assert.equal(
    maxGenerationTimeLimitForHost("localhost"),
    LOCAL_DEEP_SOLVE_SECONDS,
  );
});

test("127.0.0.1 keeps browser automation fast but can still request Deep Solve", () => {
  assert.equal(defaultGenerationTimeLimitForHost("127.0.0.1"), 30);
  assert.equal(
    maxGenerationTimeLimitForHost("127.0.0.1"),
    LOCAL_DEEP_SOLVE_SECONDS,
  );
});

test("production keeps the short generation budget", () => {
  assert.equal(isLocalDeepSolveHost("timetable.example.cz"), false);
  assert.equal(defaultGenerationTimeLimitForHost("timetable.example.cz"), 240);
  assert.equal(maxGenerationTimeLimitForHost("timetable.example.cz"), 300);
});
