'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { parseDesign, warnings } from '@/designer/model';
import { ReviewPlan } from '@/components/designer/review-plan';
import { Preview } from '@/components/designer/preview';
export default function ClientReview() {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null),
    [name, setName] = useState(''),
    [text, setText] = useState(''),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    const read = () => setToken(location.hash.slice(1));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const validToken = token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  const review = useQuery(
    api.projects.getReview,
    validToken ? { token: validToken } : 'skip',
  );
  const respond = useMutation(api.projects.addReviewResponse);
  const design = useMemo(
    () => (review ? parseDesign(review.designJson) : null),
    [review],
  );
  async function submit(kind: 'comment' | 'approval') {
    if (!validToken || busy) return;
    setBusy(true);
    try {
      await respond({
        token: validToken,
        name,
        text,
        kind,
        ...(kind === 'comment' && selectedItem ? { itemId: selectedItem } : {}),
      });
      setText('');
      setConsent(false);
      setMessage(
        kind === 'approval'
          ? 'Approval recorded for this revision.'
          : 'Comment sent.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (token === null || (validToken && review === undefined))
    return (
      <main className="client-review">
        <h1>Loading client review…</h1>
      </main>
    );
  if (!validToken || !review || !design)
    return (
      <main className="client-review">
        <h1>Review unavailable</h1>
        <p>
          This link is invalid, expired or revoked. Ask the designer for a new
          link.
        </p>
      </main>
    );
  return (
    <main className="client-review">
      <header>
        <p>Kitchen Studio · Client review</p>
        <h1>{review.name}</h1>
        <p>
          Revision {review.revision} · Available until{' '}
          {new Date(review.expiresAt).toLocaleString()}
        </p>
      </header>
      <div className="business-grid">
        <section>
          <h2>Floor plan</h2>
          <ReviewPlan
            design={design}
            selected={selectedItem}
            onSelect={setSelectedItem}
            comments={review.comments}
          />
        </section>
        <section>
          <h2>3D preview</h2>
          <Preview
            design={design}
            selected={selectedItem}
            onSelect={setSelectedItem}
          />
        </section>
      </div>
      <p>
        {design.items.length} items · {design.room.width} × {design.room.depth}{' '}
        in room · {warnings(design).length} layout warnings
      </p>
      <details>
        <summary>Items and layout checks</summary>
        <ul>
          {design.items.map((i) => (
            <li key={i.id}>
              {i.sku} · {i.width} × {i.depth} × {i.height} in
            </li>
          ))}
        </ul>
        <ul>
          {warnings(design).map((w) => (
            <li key={w.id}>{w.message}</li>
          ))}
        </ul>
      </details>
      <section className="business-panel">
        <h2>Your feedback</h2>
        <label>
          Pin comment to an item
          <select
            aria-label="Feedback item"
            value={selectedItem ?? ''}
            onChange={(e) => setSelectedItem(e.target.value || null)}
          >
            <option value="">Whole design</option>
            {design.items.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1}. {item.sku}
              </option>
            ))}
          </select>
        </label>
        <p>
          {selectedItem
            ? `Comment pinned to ${design.items.find((i) => i.id === selectedItem)?.sku}.`
            : 'Click an item in the plan or 3D preview to pin a comment.'}{' '}
          Approval always covers the entire shared revision.
        </p>
        <p>
          This is a fixed snapshot. Later design changes require a new review
          link.
        </p>
        <label>
          Your name
          <input
            aria-label="Your name"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Comment
          <textarea
            aria-label="Review comment"
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !name.trim() || !text.trim()}
          onClick={() => void submit('comment')}
        >
          Send comment
        </button>
        <p>{review.approvalNotice}</p>
        <label>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{' '}
          I approve design revision {review.revision} as shown.
        </label>
        <button
          disabled={busy || !name.trim() || !consent}
          onClick={() => void submit('approval')}
        >
          Approve this revision
        </button>
        <p role="status">{message}</p>
      </section>
      <section>
        <h2>Review activity</h2>
        {review.comments.length === 0 && <p>No feedback yet.</p>}
        {review.comments.map((c, i) => (
          <article key={i}>
            <strong>
              {c.name} ·{' '}
              {c.kind === 'approval'
                ? `Approved revision ${review.revision}`
                : 'Comment'}
            </strong>
            {c.itemId && (
              <button
                onClick={() => {
                  setSelectedItem(c.itemId ?? null);
                  document
                    .querySelector(
                      '[aria-label="Select an item to pin feedback"]',
                    )
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                Pinned to{' '}
                {design.items.find((i) => i.id === c.itemId)?.sku ??
                  'shared item'}
              </button>
            )}
            <p>{c.text}</p>
            <small>{new Date(c.createdAt).toLocaleString()}</small>
          </article>
        ))}
      </section>
    </main>
  );
}
