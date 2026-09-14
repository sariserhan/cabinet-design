'use client';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthNextjsProvider } from '@convex-dev/auth/nextjs';
import type { ReactNode } from 'react';
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured');
const client = new ConvexReactClient(url);
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={client}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
