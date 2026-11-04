import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: [
    '@envio-dashboard-ai/core',
    '@envio-dashboard-ai/hypersync',
    '@envio-dashboard-ai/metrics',
    '@envio-dashboard-ai/agent',
  ],
  experimental: {
    typedRoutes: false,
  },
};

export default config;
