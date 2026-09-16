import type { NextConfig } from 'next';
const config: NextConfig = {
  outputFileTracingIncludes: {
    '/api/public-catalog-source': ['./sources/fabuwood-*/*.pdf'],
  },
};
export default config;
