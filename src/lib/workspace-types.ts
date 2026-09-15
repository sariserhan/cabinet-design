import type { Doc } from '../../convex/_generated/dataModel';
export type Overview = {
  documents: Doc<'documents'>[];
  versions: Doc<'versions'>[];
  jobs: Doc<'jobs'>[];
};
export type RecordListRow = Omit<
  Doc<'records'>,
  'payloadJson' | 'evidenceJson'
>;
export type RecordPage = {
  page: RecordListRow[];
  isDone: boolean;
  continueCursor: string;
};
export type RecordDetail = { record: Doc<'records'>; audit: Doc<'audit'>[] };
export const BENCHMARK_PAGES = [
  2, 4, 8, 9, 22, 23, 25, 27, 29, 31, 33, 35, 51, 52, 55, 58, 60, 76, 79, 81,
  91, 92, 97, 103, 104, 114, 116, 118, 124, 125, 134, 137,
];
export function parsePages(text: string): number[] {
  const result = new Set<number>();
  for (const part of text.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match)
      throw new Error('Use page numbers or ranges, such as 22-27, 51');
    const from = Number(match[1]),
      to = Number(match[2] ?? match[1]);
    if (from < 1 || to < from || to - from > 40)
      throw new Error('Invalid page range');
    for (let n = from; n <= to; n++) result.add(n);
  }
  if (result.size > 40)
    throw new Error(
      'The first milestone is limited to 40 representative pages',
    );
  return [...result].sort((a, b) => a - b);
}

/** Prefer the expanded working catalog without overriding an explicit selection. */
export function defaultCatalog(versions: Doc<'versions'>[] | undefined) {
  return versions?.find((version) => version.compilerVersion === 'direct-ai-review-v1') ?? versions?.[0];
}
