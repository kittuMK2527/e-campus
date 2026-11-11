import type { NextConfig } from "next";
import os from "os";

// Dynamically discover all active local IPv4 addresses on this machine
function getDynamicDevOrigins(): string[] {
  const origins = new Set<string>([
    "localhost",
    "127.0.0.1",
    "localhost:3000",
    "127.0.0.1:3000",
    "*.local",
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
  ]);

  try {
    const interfaces = os.networkInterfaces();
    for (const ifaceName of Object.keys(interfaces)) {
      for (const iface of interfaces[ifaceName] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          origins.add(iface.address);
          origins.add(`${iface.address}:3000`);
          origins.add(`${iface.address}:3001`);
          origins.add(`${iface.address}:3002`);
        }
      }
    }
  } catch (_) {}

  return Array.from(origins);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getDynamicDevOrigins(),
  // /cam and /cm are BOTH first-class routes — src/app/cam and src/app/cm render the
  // same CM workspace, and /l-and-d, /ld, /l-d and /allocator render the same L&D workspace.
  // Never redirect one onto the other: stored notification links, bookmarks and role
  // tokens from either era must keep resolving without a hop, and a permanent redirect
  // aimed at a route the running build lacks dead-ends the entire login flow.
  // Native binaries must stay outside the webpack bundle — resvg's .node file
  // is loaded by Node directly (skill report chart rendering).
  serverExternalPackages: ["@resvg/resvg-js", "pg"],
  // Raise API route body size limit to 50MB for bulk attendance imports
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@tanstack/react-query",
      "clsx",
      "tailwind-merge"
    ],
    serverActions: {
      bodySizeLimit: "50mb",
    },
    hideLogsAfterAbort: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
