import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/public-catalog-source': ['./sources/fabuwood-*/*.pdf'],
  },
};
export default config;
