import type { NextConfig } from "next";

const isDocker = process.env.DOCKER_BUILD === "true";
const backendUrl = (process.env.API_INTERNAL_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
  // Guest tools return the processed file directly; allow the backend's 300s job window.
  experimental: { proxyTimeout: 330_000, proxyClientMaxBodySize: "202mb" },
  ...(isDocker ? { output: "standalone" } : {}),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
