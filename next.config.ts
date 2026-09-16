import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root. A lockfile in a parent directory otherwise makes
  // Turbopack resolve modules from the wrong place in `next dev`.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
