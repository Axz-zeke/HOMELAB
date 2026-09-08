import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.trycloudflare.com', '*.loca.lt', '10.56.31.150', '192.168.100.50', '192.168.100.150', 'localhost', '127.0.0.1'],
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
};

export default nextConfig;
