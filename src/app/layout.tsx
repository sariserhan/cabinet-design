import './globals.css';
import type { ReactNode } from 'react';
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';
export const metadata = {
  title: 'Kitchen Studio',
  description: 'Kitchen planning with source-linked cabinet specifications',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexAuthNextjsServerProvider>
          <Providers>
            {children}
            <Toaster richColors />
          </Providers>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
