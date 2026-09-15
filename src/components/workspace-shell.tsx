'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConvexAuth, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import {
  FileText,
  Library,
  CheckSquare,
  ListChecks,
  History,
  ChartNoAxesCombined,
  LogOut,
} from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { AuthScreen } from './auth-screen';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
const navigation = [
  ['/catalog', 'Catalog', Library],
  ['/documents', 'Documents', FileText],
  ['/review', 'Review', CheckSquare],
  ['/rules', 'Rules', ListChecks],
  ['/versions', 'Versions', History],
  ['/benchmarks', 'Benchmarks', ChartNoAxesCombined],
] as const;
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.workspace.viewer, isAuthenticated ? {} : 'skip');
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  if (isLoading)
    return (
      <main className="p-8">
        <Skeleton className="h-12 w-64" />
        <p>Loading workspace…</p>
      </main>
    );
  if (!isAuthenticated) return <AuthScreen />;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/catalog" className="brand">
          Catalog Compiler
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={cn('nav-link', pathname === href && 'active')}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-account">
          <span>{viewer?.name ?? 'Reviewer'}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={() => void signOut()}
          >
            <LogOut />
          </Button>
        </div>
      </aside>
      <main className="workspace-main">
        <div className="demo-banner">
          <strong>Demo — AI-reviewed draft</strong>
          <span>Explore the existing catalog and its PDF sources. Unknown values remain visible.</span>
        </div>
        {children}
      </main>
    </div>
  );
}
