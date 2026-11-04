import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output bundles only what the server actually needs, so the
  // production image does not carry node_modules around.
  output: "standalone",

  // A build writes over .next while `next dev` is serving out of it, which
  // leaves the dev server throwing 500s until it is restarted. Setting
  // NEXT_DIST_DIR lets a check-build land somewhere else and leave it alone.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  experimental: {
    // Proof photos arrive through a server action, and Next buffers the whole
    // body before the action runs. The default is 1 MB, which rejects any
    // ordinary phone photo. Keep this just above the limit enforced in
    // closeCellAction, and below the proxy limit in deploy/Caddyfile.
    serverActions: { bodySizeLimit: "13mb" },
  },
};

export default nextConfig;
