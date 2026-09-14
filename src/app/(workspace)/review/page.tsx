import { Suspense } from 'react';
import { ReviewWorkspace } from '@/components/review-workspace';
export default function ReviewPage() {
  return (
    <Suspense fallback={<p>Loading review…</p>}>
      <ReviewWorkspace />
    </Suspense>
  );
}
