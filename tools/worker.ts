import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import type { Id } from '../convex/_generated/dataModel.js';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { importBenchmarkDraft } from '../src/ingestion/benchmark-draft.js';
import { recordEvidence } from '../src/catalog/record-data.js';
import { compilePage, type ExtractedPage } from '../src/ingestion/pipeline.js';
const execute = promisify(execFile);
const secret = process.env.CATALOG_WORKER_SECRET ?? '';
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
if (!secret || !url || !site)
  throw new Error(
    'Configure CATALOG_WORKER_SECRET and both Convex URLs in .env.local',
  );
const client = new ConvexHttpClient(url);
type Job = {
  _id: Id<'jobs'>;
  versionId: Id<'versions'>;
  documentId: Id<'documents'>;
  mode: 'benchmark_draft' | 'compile';
  provider: string;
  model: string;
  selectedPages: number[];
  processedPages: number[];
  failedPages: number[];
  document: { sha256: string; manufacturer: string; series: string };
};
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
async function processJob(job: Job, leaseToken: string) {
  const args = { secret: secret, jobId: job._id, leaseToken };
  const dir = await mkdtemp(path.join(tmpdir(), 'catalog-worker-'));
  let leaseLost = false;
  const heartbeat = setInterval(() => {
    void client.mutation(api.worker.heartbeat, args).catch(() => {
      leaseLost = true;
    });
  }, 30000);
  try {
    if (
      job.mode === 'compile' &&
      !process.env[
        job.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
      ]
    )
      throw new Error(
        'Configure the selected provider API key before compilation',
      );
    const response = await fetch(site + '/worker/source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error('Source download failed');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      createHash('sha256').update(bytes).digest('hex') !== job.document.sha256
    )
      throw new Error('Source hash mismatch');
    await writeFile(path.join(dir, 'source.pdf'), bytes);
    const pending = job.selectedPages.filter(
      (p) => !job.processedPages.includes(p) && !job.failedPages.includes(p),
    );
    if (!pending.length) {
      await client.mutation(api.worker.finish, args);
      return;
    }
    await execute(
      'python3',
      [
        'tools/extract_pages.py',
        path.join(dir, 'source.pdf'),
        dir,
        '--pages',
        JSON.stringify(pending),
      ],
      {
        env: { ...process.env, PYTHONPATH: path.resolve('.local/pdf-tools') },
        maxBuffer: 2000000,
        timeout: 180000,
      },
    );
    const manifest = JSON.parse(
      await readFile(path.join(dir, 'manifest.json'), 'utf8'),
    ) as { pageCount: number };
    const drafts =
      job.mode === 'benchmark_draft'
        ? await importBenchmarkDraft(
            'tests/fixtures/fabuwood-allure',
            job.documentId,
            job.document.sha256,
            job.versionId,
          )
        : [];
    for (const pageNumber of pending) {
      if (leaseLost) throw new Error('Worker lost its lease');
      const stem = path.join(dir, String(pageNumber).padStart(3, '0'));
      const page = JSON.parse(
        await readFile(stem + '.json', 'utf8'),
      ) as ExtractedPage;
      const pageArgs = {
        ...args,
        pageNumber,
        printedLabel: page.printedLabel,
        text: page.text,
        layoutJson: JSON.stringify(page),
        classification: 'other',
        classificationConfidence: 0,
        pageCount: manifest.pageCount,
      };
      let inputTokens = 0,
        outputTokens = 0,
        visionCalls = 0;
      const blockers: Record<string, string[]> = {};
      try {
        const png = await readFile(stem + '.png');
        const upload = await fetch(
          site + `/worker/image?jobId=${job._id}&pageNumber=${pageNumber}`,
          {
            method: 'POST',
            headers: {
              'X-Worker-Secret': secret,
              'X-Worker-Lease': leaseToken,
            },
            body: png,
          },
        );
        if (!upload.ok) throw new Error('Page image upload failed');
        let records = drafts.filter(
          (r) =>
            Math.min(...recordEvidence(r).map((e) => e.pageNumber)) ===
            pageNumber,
        );
        if (job.mode === 'compile') {
          const result = await compilePage({
            page,
            png,
            provider: job.provider,
            model: job.model,
            documentId: job.documentId,
            documentSha256: job.document.sha256,
            versionId: job.versionId,
            manufacturer: job.document.manufacturer,
            series: job.document.series,
          });
          records = result.records;
          for (const issue of result.critic.issues)
            (blockers[issue.entityId] ??= []).push(issue.code);
          if (result.critic.warnings.length)
            for (const record of records)
              (blockers[record.data.id] ??= []).push(
                'page_processing_warning_affecting_record',
              );
          pageArgs.classification = result.classification;
          pageArgs.classificationConfidence = result.confidence;
          inputTokens = result.inputTokens;
          outputTokens = result.outputTokens;
          visionCalls = result.visionCalls;
          pageArgs.layoutJson = JSON.stringify({
            ...page,
            regions: result.regions,
            critic: result.critic,
            run: result.run,
          });
        } else {
          pageArgs.classification = 'benchmark_draft';
        }
        await client.mutation(api.worker.page, pageArgs);
        for (let i = 0; i < records.length; i += 20)
          await client.mutation(api.worker.records, {
            ...args,
            recordsJson: JSON.stringify(records.slice(i, i + 20)),
            blockersJson: JSON.stringify(blockers),
          });
        const prices = JSON.parse(
          process.env.CATALOG_MODEL_PRICES_JSON ?? '{}',
        ) as Record<string, { input: number; output: number }>;
        const rate = prices[job.provider + ':' + job.model];
        const cost =
          rate &&
          Number.isFinite(rate.input) &&
          Number.isFinite(rate.output) &&
          rate.input >= 0 &&
          rate.output >= 0
            ? (inputTokens * rate.input + outputTokens * rate.output) /
              1_000_000
            : undefined;
        await client.mutation(api.worker.finishPage, {
          ...args,
          pageNumber,
          failed: false,
          inputTokens,
          outputTokens,
          visionCalls,
          ...(cost !== undefined ? { estimatedCost: cost } : {}),
        });
        console.log(
          `Page ${pageNumber}: ${records.length} records stored for review`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Page processing failed';
        await client.mutation(api.worker.page, {
          ...pageArgs,
          error: message.slice(0, 1000),
        });
        await client.mutation(api.worker.finishPage, {
          ...args,
          pageNumber,
          failed: true,
          inputTokens,
          outputTokens,
          visionCalls,
        });
        console.error(`Page ${pageNumber} failed: ${message.slice(0, 300)}`);
      }
    }
    await client.mutation(api.worker.finish, args);
  } catch (error) {
    await client
      .mutation(api.worker.finish, {
        ...args,
        error: (error instanceof Error ? error.message : 'Worker failed').slice(
          0,
          1000,
        ),
      })
      .catch(() => {});
    console.error(
      'Job failed:',
      error instanceof Error ? error.message : 'unknown',
    );
  } finally {
    clearInterval(heartbeat);
    await rm(dir, { recursive: true, force: true });
  }
}
console.log('Catalog worker ready');
while (!stopping) {
  try {
    const token = randomUUID();
    const raw = await client.mutation(api.worker.claim, {
      secret,
      leaseToken: token,
    });
    if (raw) {
      await processJob(JSON.parse(raw) as Job, token);
      if (process.argv.includes('--once')) break;
    } else if (process.argv.includes('--once')) break;
    else await new Promise((r) => setTimeout(r, 3000));
  } catch (error) {
    console.error(
      'Worker connection failed:',
      error instanceof Error ? error.message : 'unknown',
    );
    if (process.argv.includes('--once')) process.exitCode = 1;
    if (process.argv.includes('--once')) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
}
