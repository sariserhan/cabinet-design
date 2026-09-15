'use client';
import { useRef, useState } from 'react';
import { type Design } from '@/designer/model';
import {
  type Closeout,
  type CloseoutTask,
  starterCloseout,
  signCloseout,
  isClosed,
  handoverDocument,
} from '@/designer/closeout';
import { compactPhoto } from './compact-photo';
import { downloadJson } from './business-tools';
export function downloadHtml(html: string, name: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CloseoutTools({
  design,
  value,
  onChange,
}: {
  design: Design;
  value: Closeout;
  onChange: (next: Closeout) => void;
}) {
  const [room, setRoom] = useState('Kitchen'),
    [title, setTitle] = useState(''),
    [kind, setKind] = useState<'check' | 'punch'>('punch'),
    [name, setName] = useState(''),
    [message, setMessage] = useState('');
  const latest = useRef(value);
  latest.current = value;
  function save(next: Closeout) {
    try {
      onChange(next);
      setMessage('Closeout saved in this browser.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function patch(id: string, change: Partial<CloseoutTask>) {
    const { signoff, ...rest } = value;
    void signoff;
    save({
      ...rest,
      tasks: value.tasks.map((t) => (t.id === id ? { ...t, ...change } : t)),
    });
  }
  return (
    <details className="business-panel closeout-panel">
      <summary>Installation closeout & handover</summary>
      <p>
        Work room by room, resolve outstanding items and record completion.
        Completion names are self-reported. Up to 60 tasks and eight compact
        photos.
      </p>
      <p>
        {isClosed(design, value)
          ? `Completion recorded by ${value.signoff?.name}`
          : `${value.tasks.filter((t) => t.status === 'open').length} unresolved items · completion not recorded for the current design`}
      </p>
      {!value.tasks.length && (
        <button
          onClick={() =>
            save(starterCloseout(design.id, room.trim() || 'Kitchen'))
          }
        >
          Start installation checklist
        </button>
      )}
      <div className="business-grid">
        <label>
          Room
          <input
            aria-label="Closeout room"
            value={room}
            maxLength={100}
            onChange={(e) => setRoom(e.target.value)}
          />
        </label>
        <label>
          New item
          <input
            aria-label="Closeout item title"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Item type
          <select
            aria-label="Closeout item type"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'check' | 'punch')}
          >
            <option value="punch">Punch-list finding</option>
            <option value="check">Checklist task</option>
          </select>
        </label>
      </div>
      <button
        disabled={!room.trim() || !title.trim() || value.tasks.length >= 60}
        onClick={() => {
          const { signoff, ...rest } = value;
          void signoff;
          save({
            ...rest,
            tasks: [
              ...value.tasks,
              {
                id: crypto.randomUUID(),
                room,
                title,
                kind,
                status: 'open',
                note: '',
                assignee: '',
              },
            ],
          });
          setTitle('');
        }}
      >
        Add closeout item
      </button>
      {[...new Set(value.tasks.map((t) => t.room))].map((roomName) => (
        <section key={roomName}>
          <h3>{roomName}</h3>
          {value.tasks
            .filter((t) => t.room === roomName)
            .map((t) => (
              <article key={t.id} className="purchase-card">
                <h4>{t.title}</h4>
                <small>{t.kind === 'punch' ? 'Punch list' : 'Checklist'}</small>
                <div className="business-grid">
                  <label>
                    Status
                    <select
                      aria-label={`Closeout status: ${t.title}`}
                      value={t.status}
                      onChange={(e) =>
                        patch(t.id, {
                          status: e.target.value as 'open' | 'done',
                        })
                      }
                    >
                      <option value="open">Open</option>
                      <option value="done">Done</option>
                    </select>
                  </label>
                  <label>
                    Assigned to
                    <input
                      aria-label={`Closeout assignee: ${t.title}`}
                      value={t.assignee}
                      maxLength={120}
                      onChange={(e) =>
                        patch(t.id, { assignee: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Findings
                    <textarea
                      aria-label={`Closeout note: ${t.title}`}
                      value={t.note}
                      maxLength={2000}
                      onChange={(e) => patch(t.id, { note: e.target.value })}
                    />
                  </label>
                  <label>
                    Evidence photo
                    <input
                      type="file"
                      accept="image/*"
                      aria-label={`Closeout photo: ${t.title}`}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        const source = latest.current;
                        try {
                          const photo = await compactPhoto(f);
                          if (latest.current !== source)
                            throw Error(
                              'Closeout changed while processing the photo. Try again.',
                            );
                          patch(t.id, { photo });
                        } catch (e) {
                          setMessage((e as Error).message);
                        }
                      }}
                    />
                  </label>
                </div>
                {t.photo && (
                  <>
                    <img
                      src={t.photo}
                      alt={`Closeout evidence: ${t.title}`}
                      width={200}
                    />
                    <button
                      onClick={() => {
                        const { photo, ...rest } = t;
                        void photo;
                        const { signoff, ...c } = value;
                        void signoff;
                        save({
                          ...c,
                          tasks: value.tasks.map((task) =>
                            task.id === t.id ? rest : task,
                          ),
                        });
                      }}
                    >
                      Remove evidence photo
                    </button>
                  </>
                )}
              </article>
            ))}
        </section>
      ))}
      <label>
        Care, warranty and contact notes
        <textarea
          aria-label="Handover care notes"
          maxLength={4000}
          value={value.care}
          onChange={(e) => {
            const { signoff, ...rest } = value;
            void signoff;
            save({ ...rest, care: e.target.value });
          }}
        />
      </label>
      <label>
        Completion recorded by
        <input
          aria-label="Completion recorded by"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="designer-row">
        <button
          disabled={
            !name.trim() ||
            !value.tasks.length ||
            value.tasks.some((t) => t.status !== 'done')
          }
          onClick={() => {
            try {
              save(signCloseout(design, value, name));
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Record installation completion
        </button>
        <button
          onClick={() =>
            downloadHtml(
              handoverDocument(design, value),
              'customer-handover.html',
            )
          }
        >
          Export customer handover
        </button>
        <button
          onClick={() =>
            downloadJson(
              { design, closeout: value },
              'installation-closeout.json',
            )
          }
        >
          Export closeout data
        </button>
      </div>
      <p role="status">{message}</p>
    </details>
  );
}
