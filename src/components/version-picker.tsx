'use client';
import type { Doc } from '../../convex/_generated/dataModel';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
} from '@/components/ui/select';
export function VersionPicker({
  versions,
  value,
  onChange,
}: {
  versions: Doc<'versions'>[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v);
      }}
    >
      <SelectTrigger className="min-w-64" aria-label="Catalog version">
        <SelectValue placeholder="Select a catalog">
          {versions.find((v) => v._id === value)?.label ?? 'Select a catalog'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {versions.map((v) => (
            <SelectItem key={v._id} value={v._id}>
              {v.label} ·{' '}
              {v.origin === 'benchmark_draft' ? 'draft benchmark' : v.status}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
