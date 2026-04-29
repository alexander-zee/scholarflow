import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@node-latex-compiler/bin-win32-x64",
    "@node-latex-compiler/bin-linux-x64",
    "@node-latex-compiler/bin-darwin-x64",
    "@node-latex-compiler/bin-darwin-arm64",
  ],
};

export default nextConfig;
