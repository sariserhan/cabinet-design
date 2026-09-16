import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publicCatalogs } from '@/designer/public-catalogs';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const series = new URL(request.url).searchParams.get('series');
  const catalog = publicCatalogs.find((c) => c.series.toLowerCase() === series);
  if (!catalog) return new Response('Catalog not found', { status: 404 });
  // The manifest paths are already rooted in sources/, but the build traces
  // whatever a filesystem read can statically reach: handing it a fully
  // dynamic path made it copy the entire project into this route's bundle.
  // Naming the folder as a literal scopes that trace to the spec books.
  const data = await readFile(
    join(
      process.cwd(),
      'sources',
      catalog.sourcePath.replace(/^sources\//, ''),
    ),
  );
  return new Response(data, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${catalog.series}-02-26-26.pdf"`,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
