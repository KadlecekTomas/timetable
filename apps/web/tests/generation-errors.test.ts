import assert from "node:assert/strict";
import test from "node:test";

import { generationFailureMessage } from "../lib/generation-errors";

test("generationFailureMessage reads direct and nested solver errors", () => {
  assert.equal(
    generationFailureMessage({ message: "Výpočet překročil časový limit." }),
    "Výpočet překročil časový limit.",
  );
  assert.equal(
    generationFailureMessage({
      error: {
        code: "SOLVER_PROXY_FAILED",
        message: "Plánovací modul je dočasně nedostupný.",
        details: { message: "fetch failed" },
      },
    }),
    "Plánovací modul je dočasně nedostupný.",
  );
  assert.equal(generationFailureMessage(null), null);
});
