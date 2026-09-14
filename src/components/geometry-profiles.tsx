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
export function GeometryProfiles({ version }: { version: Doc<'versions'> }) {
  const [open, setOpen] = useState(false),
    [json, setJson] = useState(version.profilesJson ?? '[]'),
    [reason, setReason] = useState('');
  const save = useMutation(api.versions.setProfiles);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="w-fit"
            disabled={['published', 'superseded'].includes(version.status)}
          />
        }
      >
        Required geometry policies
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Required geometry by category</DialogTitle>
        </DialogHeader>
        <p>
          Cabinet, panel, filler, and molding dimensions are mandatory.
          Accessory and hardware categories need an explicit policy based on
          their source. Each profile must require at least one numeric
          dimension. Saving a policy invalidates previous benchmark results.
        </p>
        <p className="source-quote">
          {
            '[{"category":"accessory","requirements":{"widthIn":{"required":true,"valueType":"number","positiveDimension":true}}}]'
          }
        </p>
        <Field>
          <FieldLabel htmlFor="profiles-json">Profiles JSON</FieldLabel>
          <Textarea
            id="profiles-json"
            className="json-editor"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="profiles-reason">
            Source-based policy reason
          </FieldLabel>
          <Input
            id="profiles-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Button
          onClick={async () => {
            try {
              await save({
                versionId: version._id,
                profilesJson: json,
                reason,
              });
              setOpen(false);
              toast.success('Geometry policy saved with audit history');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Policy failed');
            }
          }}
        >
          Save policy
        </Button>
      </DialogContent>
    </Dialog>
  );
}
