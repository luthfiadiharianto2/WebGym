import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Kamera hanya boleh dipakai oleh origin ini sendiri; mikrofon & geolokasi dimatikan.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["three"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
