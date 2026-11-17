import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: [],
  serverExternalPackages: ["better-sqlite3", "authenticate-pam", "pino", "pino-pretty"],
  turbopack: {},
};

export default nextConfig;
