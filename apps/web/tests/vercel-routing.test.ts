import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface VercelConfiguration {
  services?: Record<
    string,
    {
      routes?: Array<{
        src?: string;
        transforms?: Array<{
          type?: string;
          op?: string;
          args?: string;
        }>;
      }>;
    }
  >;
  rewrites?: Array<{
    source?: string;
    destination?: { service?: string } | string;
  }>;
}

test("Vercel routes /solver calls to FastAPI without the public prefix", async () => {
  const configuration = JSON.parse(
    await readFile(new URL("../../../vercel.json", import.meta.url), "utf8"),
  ) as VercelConfiguration;

  const solverRewrite = configuration.rewrites?.find(
    (rewrite) => rewrite.source === "/solver/:path*",
  );
  assert.deepEqual(solverRewrite?.destination, { service: "solver" });

  const transform = configuration.services?.solver?.routes?.[0];
  assert.equal(transform?.src, "/solver/(.*)");
  assert.deepEqual(transform?.transforms, [
    {
      type: "request.path",
      op: "set",
      args: "/$1",
    },
  ]);
});
