import path from "node:path";

import type { NextConfig } from "next";

const solverUrl = process.env.SOLVER_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  async rewrites() {
    if (!solverUrl) return [];
    return [
      {
        source: "/solver/:path*",
        destination: `${solverUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
