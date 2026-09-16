import type { NextConfig } from 'next';
const config: NextConfig = {
  experimental: {
    // src/proxy.ts matches every route, so Next buffers each request body to
    // allow a second read. That buffer defaults to 10 MB and silently keeps
    // only the first 10 MB of anything larger, which truncated a 12 MB source
    // PDF into a document that still passed its own SHA-256 check. Match the
    // 50 MB ceiling the upload route and the Convex action already enforce.
    proxyClientMaxBodySize: '50mb',
  },
  outputFileTracingIncludes: {
    '/api/public-catalog-source': ['./sources/fabuwood-*/*.pdf'],
  },
};
export default config;
