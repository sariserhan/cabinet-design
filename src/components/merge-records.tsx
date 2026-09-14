'use client';
import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { RecordListRow } from '@/lib/workspace-types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { toast } from 'sonner';
export function MergeRecords({
  records,
  locked,
  onDone,
}: {
  records: RecordListRow[];
  locked: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false),
    [json, setJson] = useState(''),
    [reason, setReason] = useState('');
  const merge = useMutation(api.review.merge);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={locked || records.length < 2 || records.length > 10}
          />
        }
      >
        Merge selected ({records.length})
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Merge duplicate or fragmented records</DialogTitle>
        </DialogHeader>
        <p>
          Selected: {records.map((r) => r.sku).join(', ')}. Enter one complete
          structured record with the combined evidence. All original records
          retain their audit history. The merged record requires review.
        </p>
        <Field>
          <FieldLabel htmlFor="merge-json">Merged record JSON</FieldLabel>
          <Textarea
            id="merge-json"
            className="json-editor"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="merge-reason">Reason</FieldLabel>
          <Input
            id="merge-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Button
          onClick={async () => {
            try {
              await merge({
                recordIds: records.map((r) => r._id),
                expectedRevisions: records.map((r) => r.revision),
                payloadJson: json,
                reason,
              });
              setOpen(false);
              onDone();
              toast.success('Merged record created for review');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Merge failed');
            }
          }}
        >
          Merge with audit history
        </Button>
      </DialogContent>
    </Dialog>
  );
}
