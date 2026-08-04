import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("failed import previews are always reanalyzed", async () => {
  const source = await readFile(
    path.join(process.cwd(), "lib", "local", "api.ts"),
    "utf8",
  );

  assert.match(source, /batch\.status === "READY"/);
  assert.doesNotMatch(
    source,
    /\["READY", "VALIDATION_FAILED", "APPLIED"\]\.includes\(batch\.status\)/,
  );
});
