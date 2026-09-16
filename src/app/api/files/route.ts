import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
export async function GET(request: Request) {
  const token = await convexAuthNextjsToken();
  if (!token) return new Response('Unauthorized', { status: 401 });
  const url = new URL('/files', process.env.NEXT_PUBLIC_CONVEX_SITE_URL);
  url.search = new URL(request.url).search;
  const upstream = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type':
        upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export async function POST(request: Request) {
  const token = await convexAuthNextjsToken();
  if (!token) return new Response('Unauthorized', { status: 401 });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 50 * 1024 * 1024)
    return new Response('PDF exceeds 50 MB', { status: 413 });
  // A truncated body still hashes cleanly, so a short upload would be stored as
  // a valid-looking source. Next's proxy buffer drops the tail silently when a
  // body exceeds its limit, so compare against what the client said it sent and
  // refuse anything incomplete rather than recording a corrupt document.
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 0 && bytes.byteLength < declared)
    return new Response(
      `Upload was truncated (${bytes.byteLength} of ${declared} bytes). Retry, and raise experimental.proxyClientMaxBodySize if this repeats.`,
      { status: 400 },
    );
  const url = new URL('/upload', process.env.NEXT_PUBLIC_CONVEX_SITE_URL);
  url.search = new URL(request.url).search;
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
