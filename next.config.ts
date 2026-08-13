import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's engine is a native binary; keep it out of the bundler's reach.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],

  // This app lives in a subdirectory of a repository that has its own lockfile
  // at the root. Without this, Next infers the parent as the workspace root and
  // traces files from an unrelated project into the deployment bundle.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
