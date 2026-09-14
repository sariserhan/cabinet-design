'use client';
import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Overview } from '@/lib/workspace-types';
import { BENCHMARK_PAGES, parsePages } from '@/lib/workspace-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
export default function Documents() {
  const raw = useQuery(api.workspace.overview, {});
  const data = raw ? (JSON.parse(raw) as Overview) : undefined;
  const enqueue = useMutation(api.workspace.enqueue);
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [uploadOpen, setUploadOpen] = useState(false),
    [selected, setSelected] = useState<Id<'documents'> | null>(null),
    [provider, setProvider] = useState('openai'),
    [model, setModel] = useState(''),
    [pages, setPages] = useState(BENCHMARK_PAGES.join(', '));
  async function loadBenchmark() {
    setBusy(true);
    try {
      const response = await fetch('/api/benchmark-source', { method: 'POST' });
      if (!response.ok) throw new Error(await response.text());
      const { documentId } = (await response.json()) as {
        documentId: Id<'documents'>;
      };
      const versionId = await enqueue({
        documentId,
        mode: 'benchmark_draft',
        pages: BENCHMARK_PAGES,
        provider: 'none',
        model: 'draft-fixture',
      });
      router.push('/review?version=' + versionId);
      toast.success('Draft benchmark queued for your private workspace');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <h1>Documents</h1>
          <p className="muted">
            Private manufacturer sources and compilation jobs
          </p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger render={<Button />}>Upload PDF</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload a manufacturer document</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  file = f.get('file');
                if (!(file instanceof File)) return;
                setBusy(true);
                try {
                  const query = new URLSearchParams({
                    name: file.name,
                    manufacturer: String(f.get('manufacturer')),
                    series: String(f.get('series')),
                    version: String(f.get('version')),
                  });
                  const response = await fetch('/api/files?' + query, {
                    method: 'POST',
                    body: file,
                  });
                  if (!response.ok) throw new Error(await response.text());
                  const result = (await response.json()) as {
                    documentId: Id<'documents'>;
                  };
                  setSelected(result.documentId);
                  setUploadOpen(false);
                  toast.success('Source uploaded');
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : 'Upload failed',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="manufacturer">Manufacturer</FieldLabel>
                  <Input id="manufacturer" name="manufacturer" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="series">Series</FieldLabel>
                  <Input id="series" name="series" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="document-version">
                    Document version
                  </FieldLabel>
                  <Input id="document-version" name="version" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="file">PDF file</FieldLabel>
                  <Input
                    id="file"
                    name="file"
                    type="file"
                    accept="application/pdf"
                    required
                  />
                  <FieldDescription>
                    Maximum 50 MB. The exact source is identified by its
                    SHA-256.
                  </FieldDescription>
                </Field>
                <Button disabled={busy} type="submit">
                  {busy ? 'Uploading…' : 'Upload'}
                </Button>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </header>
      <div className="page-body">
        <Alert className="notice">
          <AlertTitle>
            Start with the representative Allure benchmark
          </AlertTitle>
          <AlertDescription>
            Load the pinned source and 189 draft product annotations to review
            evidence. This imports drafts; it does not claim a successful
            extraction or human verification.
            <div className="mt-3">
              <Button disabled={busy} onClick={() => void loadBenchmark()}>
                {busy ? 'Preparing…' : 'Load Allure draft benchmark'}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
        {data?.documents.length ? (
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Manufacturer / series</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.documents.map((d) => (
                  <TableRow key={d._id}>
                    <TableCell>
                      <Button variant="link" onClick={() => setSelected(d._id)}>
                        {d.name}
                      </Button>
                      <div className="muted text-xs">
                        {d.sha256.slice(0, 16)}…
                      </div>
                    </TableCell>
                    <TableCell>
                      {d.manufacturer} / {d.series}
                    </TableCell>
                    <TableCell>{d.pageCount || 'Not processed'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{d.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <a
                        href={'/api/files?documentId=' + d._id}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View PDF
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No documents yet</EmptyTitle>
              <EmptyDescription>
                Upload a source PDF or load the Allure benchmark.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {selected ? (
          <section className="max-w-3xl">
            <h2>Compile a representative subset</h2>
            <p className="muted mb-4">
              {data?.documents.find((d) => d._id === selected)?.name}
            </p>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="pages">
                  Physical PDF page numbers
                </FieldLabel>
                <Input
                  id="pages"
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                />
                <FieldDescription>
                  Select up to 40 pages, including any cross-page dependencies.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>AI provider</FieldLabel>
                <Select
                  value={provider}
                  onValueChange={(v) => {
                    if (v) setProvider(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="model">Model ID</FieldLabel>
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Enter a model available to your provider account"
                />
              </Field>
              <Button
                disabled={busy || !model.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const versionId = await enqueue({
                      documentId: selected,
                      mode: 'compile',
                      pages: parsePages(pages),
                      provider,
                      model,
                    });
                    router.push('/review?version=' + versionId);
                  } catch (e) {
                    toast.error(
                      e instanceof Error
                        ? e.message
                        : 'Could not queue compilation',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Queue compilation
              </Button>
            </FieldGroup>
          </section>
        ) : null}
        {data?.jobs.length ? (
          <section>
            <h2 className="mb-3">Recent processing jobs</h2>
            <div className="table-wrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>AI usage</TableHead>
                    <TableHead>Estimated cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.jobs.map((j) => (
                    <TableRow key={j._id}>
                      <TableCell>
                        <Button
                          variant="link"
                          onClick={() =>
                            router.push('/review?version=' + j.versionId)
                          }
                        >
                          {j.mode === 'benchmark_draft'
                            ? 'Draft benchmark import'
                            : 'Catalog compilation'}
                        </Button>
                        {j.error ? (
                          <p className="text-destructive max-w-md">{j.error}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {j.processedPages.length}/{j.selectedPages.length} pages
                        · {j.failedPages.length} failures
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            j.status === 'failed' ? 'destructive' : 'secondary'
                          }
                        >
                          {j.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {j.inputTokens.toLocaleString()} in /{' '}
                        {j.outputTokens.toLocaleString()} out
                      </TableCell>
                      <TableCell>
                        {j.mode === 'benchmark_draft'
                          ? 'No AI calls'
                          : j.estimatedCost === undefined
                            ? 'Not available'
                            : '$' + j.estimatedCost.toFixed(4)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
