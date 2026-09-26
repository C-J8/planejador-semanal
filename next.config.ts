import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A development session must not replace the prepared daily-use build.
  distDir: process.env.PLANNER_MODE === "daily" ? ".next-daily" : ".next",
};

export default nextConfig;
