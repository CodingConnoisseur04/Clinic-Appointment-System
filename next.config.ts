import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: the canonical local URL is http://127.0.0.1:3000 (matches
  // supabase/config.toml site_url and .env.local). Next 16 blocks dev
  // resources for non-allowlisted hosts, so 127.0.0.1 must be listed here or
  // every JS chunk 403s and pages never hydrate when opened via that host.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
