import { Suspense } from 'react';
import { ReviewWorkspace } from '@/components/review-workspace';
export default function RulesPage() {
  return (
    <Suspense fallback={<p>Loading rules…</p>}>
      <ReviewWorkspace title="Rules" kind="rule" />
    </Suspense>
  );
}
