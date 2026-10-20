/** @type {import("next").NextConfig} */

const config = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "pg"],
  async headers() {
    return [{
      source: "/api/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, max-age=0" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
};

export default config;
