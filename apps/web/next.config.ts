import path from "node:path";

import type { NextConfig } from "next";

const solverUrl = (process.env.SOLVER_URL ?? "http://solver:8000").replace(
  /\/$/,
  "",
);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/solver/:path*",
        destination: `${solverUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
