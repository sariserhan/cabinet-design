'use client';
import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';
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
export function SplitRecord({
  record,
  locked,
}: {
  record: Doc<'records'>;
  locked: boolean;
}) {
  const [open, setOpen] = useState(false),
    [json, setJson] = useState('[]'),
    [reason, setReason] = useState('');
  const split = useMutation(api.review.split);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={locked} />}>
        Split record
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Split a conflated extraction</DialogTitle>
        </DialogHeader>
        <p>
          Provide 2–10 complete records of the same kind with distinct new
          identities and source evidence. The original remains in audit history
          as rejected; each new record requires review.
        </p>
        <Field>
          <FieldLabel htmlFor="split-json">New records JSON array</FieldLabel>
          <Textarea
            id="split-json"
            className="json-editor"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="split-reason">Reason</FieldLabel>
          <Input
            id="split-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Button
          onClick={async () => {
            try {
              await split({
                recordId: record._id,
                expectedRevision: record.revision,
                payloadsJson: json,
                reason,
              });
              setOpen(false);
              toast.success('Split recorded; review the new records');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Split failed');
            }
          }}
        >
          Create separate records
        </Button>
      </DialogContent>
    </Dialog>
  );
}
