import { httpRouter } from 'convex/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { auth } from './auth';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
const http = httpRouter();
auth.addHttpRoutes(http);
function headers(request: Request) {
  const base = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const allowed = process.env.SITE_URL;
  // An unconfigured deployment has no trusted origin. Omit the header entirely
  // rather than falling back to a development origin, so CORS denies the call.
  if (!allowed) return base;
  const origin = request.headers.get('origin');
  return {
    ...base,
    'Access-Control-Allow-Origin': origin === allowed ? origin : allowed,
  };
}
// Fail loudly as well as closed: a missing SITE_URL is a deployment fault, not
// a client error, and is otherwise only visible as an opaque CORS failure.
function misconfigured(request: Request) {
  return process.env.SITE_URL
    ? null
    : new Response('SITE_URL is not configured on this Convex deployment', {
        status: 503,
        headers: headers(request),
      });
}
// Worker routes are server-to-server and share one credential convention:
// secret and lease in headers, job identity in the query string.
function workerRequest(request: Request) {
  const url = new URL(request.url);
  return {
    url,
    args: {
      secret: request.headers.get('X-Worker-Secret') ?? '',
      jobId: url.searchParams.get('jobId') as Id<'jobs'>,
      leaseToken: request.headers.get('X-Worker-Lease') ?? '',
    },
  };
}
const preflight = httpAction(
  async (_ctx, req) =>
    misconfigured(req) ??
    new Response(null, { status: 204, headers: headers(req) }),
);
http.route({ path: '/upload', method: 'OPTIONS', handler: preflight });
http.route({ path: '/files', method: 'OPTIONS', handler: preflight });
http.route({
  path: '/upload',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const fault = misconfigured(req);
    if (fault) return fault;
    try {
      const ownerId = await getAuthUserId(ctx);
      if (!ownerId)
        return new Response('Unauthorized', {
          status: 401,
          headers: headers(req),
        });
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (
        bytes.length > 50 * 1024 * 1024 ||
        new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-'
      )
        return new Response('Upload a PDF up to 50 MB', {
          status: 400,
          headers: headers(req),
        });
      const u = new URL(req.url);
      const storageId = await ctx.storage.store(
        new Blob([bytes], { type: 'application/pdf' }),
      );
      const documentId = await ctx.runMutation(internal.documents.register, {
        ownerId,
        storageId,
        name: (u.searchParams.get('name') ?? 'Specification.pdf').slice(0, 200),
        manufacturer: (u.searchParams.get('manufacturer') ?? 'Unknown').slice(
          0,
          100,
        ),
        series: (u.searchParams.get('series') ?? 'Unknown').slice(0, 100),
        documentVersion: (u.searchParams.get('version') ?? 'Unspecified').slice(
          0,
          100,
        ),
        sha256: bytesToHex(sha256(bytes)),
        byteLength: bytes.length,
      });
      return Response.json({ documentId }, { headers: headers(req) });
    } catch {
      return new Response('Upload failed', {
        status: 400,
        headers: headers(req),
      });
    }
  }),
});
http.route({
  path: '/files',
  method: 'GET',
  handler: httpAction(async (ctx, req) => {
    const fault = misconfigured(req);
    if (fault) return fault;
    try {
      const ownerId = await getAuthUserId(ctx);
      if (!ownerId)
        return new Response('Unauthorized', {
          status: 401,
          headers: headers(req),
        });
      const u = new URL(req.url);
      const documentId = u.searchParams.get('documentId'),
        pageId = u.searchParams.get('pageId'),
        versionId = u.searchParams.get('versionId');
      const storageId = await ctx.runQuery(internal.documents.locate, {
        ownerId,
        ...(documentId ? { documentId: documentId as Id<'documents'> } : {}),
        ...(pageId ? { pageId: pageId as Id<'pages'> } : {}),
        ...(versionId ? { versionId: versionId as Id<'versions'> } : {}),
      });
      const blob = storageId ? await ctx.storage.get(storageId) : null;
      if (!blob)
        return new Response('Not found', {
          status: 404,
          headers: headers(req),
        });
      return new Response(blob, {
        headers: {
          ...headers(req),
          'Content-Type': blob.type || 'application/octet-stream',
        },
      });
    } catch {
      return new Response('Not found', { status: 404, headers: headers(req) });
    }
  }),
});
http.route({
  path: '/worker/source',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    try {
      const { args } = workerRequest(req);
      const storageId = await ctx.runQuery(internal.worker.source, args);
      const blob = await ctx.storage.get(storageId);
      if (!blob) return new Response('Not found', { status: 404 });
      return new Response(blob, {
        headers: {
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return new Response('Unauthorized', { status: 401 });
    }
  }),
});
http.route({
  path: '/worker/image',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    try {
      const { url, args } = workerRequest(req);
      await ctx.runQuery(internal.worker.source, args);
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (
        bytes.length > 10000000 ||
        bytes[0] !== 137 ||
        bytes[1] !== 80 ||
        bytes[2] !== 78 ||
        bytes[3] !== 71
      )
        return new Response('Invalid PNG', { status: 400 });
      const storageId = await ctx.storage.store(
        new Blob([bytes], { type: 'image/png' }),
      );
      await ctx.runMutation(internal.worker.image, {
        ...args,
        storageId,
        pageNumber: Number(url.searchParams.get('pageNumber')),
      });
      return new Response('OK');
    } catch {
      return new Response('Worker upload failed', { status: 400 });
    }
  }),
});
export default http;
