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
  const origin = request.headers.get('origin');
  const allowed = process.env.SITE_URL;
  return {
    'Access-Control-Allow-Origin':
      origin === allowed ? origin : (allowed ?? 'http://localhost:3000'),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}
const preflight = httpAction(
  async (_ctx, req) =>
    new Response(null, { status: 204, headers: headers(req) }),
);
http.route({ path: '/upload', method: 'OPTIONS', handler: preflight });
http.route({ path: '/files', method: 'OPTIONS', handler: preflight });
http.route({
  path: '/upload',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
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
      const args = (await req.json()) as {
        secret: string;
        jobId: Id<'jobs'>;
        leaseToken: string;
      };
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
      const u = new URL(req.url);
      const secret = req.headers.get('X-Worker-Secret') ?? '';
      const jobId = u.searchParams.get('jobId') as Id<'jobs'>;
      const leaseToken = req.headers.get('X-Worker-Lease') ?? '';
      await ctx.runQuery(internal.worker.source, { secret, jobId, leaseToken });
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
        secret,
        jobId,
        leaseToken,
        storageId,
        pageNumber: Number(u.searchParams.get('pageNumber')),
      });
      return new Response('OK');
    } catch {
      return new Response('Worker upload failed', { status: 400 });
    }
  }),
});
export default http;
