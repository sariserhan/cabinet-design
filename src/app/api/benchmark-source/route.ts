import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export async function POST() {
  const token = await convexAuthNextjsToken();
  if (!token) return new Response('Unauthorized', { status: 401 });
  const bytes = await readFile(
    path.join(
      process.cwd(),
      'sources/fabuwood-allure/Allure_Spec_Book_02-26-26.pdf',
    ),
  );
  const url = new URL('/upload', process.env.NEXT_PUBLIC_CONVEX_SITE_URL);
  url.search = new URLSearchParams({
    name: 'Allure Spec Book V.02.26.26',
    manufacturer: 'Fabuwood',
    series: 'Allure',
    version: 'V.02.26.26',
  }).toString();
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/pdf',
    },
    body: bytes,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'text/plain',
      'Cache-Control': 'no-store',
    },
  });
}
