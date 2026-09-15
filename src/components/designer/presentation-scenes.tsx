'use client';
import { useEffect, useRef, useState } from 'react';
import {
  emptyPresentationScenes,
  parsePresentationScenes,
  type PresentationScene,
  type PresentationScenes as SceneSet,
} from '@/designer/render-settings';

type Props = {
  ownerId: string;
  designId: string;
  sourceVersion: string;
  capture: () => Omit<PresentationScene, 'id' | 'name'> | null;
  apply: (scene: PresentationScene) => void;
  renderScene: (
    scene: PresentationScene,
    signal: AbortSignal,
    preview: boolean,
    onStatus: (s: string) => void,
  ) => Promise<string>;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
};
export function PresentationScenes({
  ownerId,
  designId,
  sourceVersion,
  capture,
  apply,
  renderScene,
  onBusy,
  disabled,
}: Props) {
  const key = `kitchen-scenes:${ownerId}:${designId}`;
  const [data, setData] = useState<SceneSet>(() =>
    emptyPresentationScenes(designId),
  );
  const raw = useRef<string | null>(null);
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState(''),
    [name, setName] = useState('Presentation scene'),
    [busy, setBusy] = useState(false);
  const [zip, setZip] = useState<string | null>(null);
  const job = useRef<AbortController | null>(null);
  const busyCallback = useRef(onBusy);
  busyCallback.current = onBusy;
  useEffect(() => {
    job.current?.abort();
  }, [sourceVersion]);
  useEffect(() => {
    const read = () => {
      try {
        const value = localStorage.getItem(key);
        setData(
          value
            ? parsePresentationScenes(value, designId)
            : emptyPresentationScenes(designId),
        );
        raw.current = value;
        setReady(true);
      } catch {
        setReady(false);
        setMessage(
          'Saved scenes could not be read. Export or recover the stored data before replacing it.',
        );
      }
    };
    read();
    const changed = (e: StorageEvent) => {
      if (e.key === key) read();
    };
    window.addEventListener('storage', changed);
    return () => {
      window.removeEventListener('storage', changed);
      job.current?.abort();
      job.current = null;
      busyCallback.current(false);
    };
  }, [key, designId]);
  useEffect(
    () => () => {
      if (zip) URL.revokeObjectURL(zip);
    },
    [zip],
  );
  function save(next: SceneSet) {
    try {
      if (localStorage.getItem(key) !== raw.current)
        throw Error(
          'Scenes changed in another tab. Reopen Render to load the latest scenes.',
        );
      const value = JSON.stringify(
        parsePresentationScenes(JSON.stringify(next), designId),
      );
      localStorage.setItem(key, value);
      raw.current = value;
      setData(next);
      setMessage(
        'Scenes saved on this browser. Complete project backups include them.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save scenes.');
    }
  }
  function downloadSettings() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'presentation-scenes.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function batch(preview: boolean) {
    const original = capture();
    if (!original || job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    onBusy(true);
    setZip(null);
    // Freeze the scene list; each image owns a geometry snapshot during rendering.
    const scenes = structuredClone(data.scenes);
    try {
      const { zipSync, strToU8 } = await import('fflate');
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < scenes.length; i++) {
        controller.signal.throwIfAborted();
        const scene = scenes[i];
        if (!scene) continue;
        const image = await renderScene(
          scene,
          controller.signal,
          preview,
          (status) => {
            if (job.current === controller)
              setMessage(
                `Scene ${i + 1}/${scenes.length}: ${scene.name} · ${status}`,
              );
          },
        );
        const bytes = Uint8Array.from(
          atob(image.slice(image.indexOf(',') + 1)),
          (c) => c.charCodeAt(0),
        );
        files[
          `${i + 1}-${scene.name.replace(/[^a-z0-9-]/gi, '-').slice(0, 60)}.png`
        ] = bytes;
      }
      controller.signal.throwIfAborted();
      files['scenes.json'] = strToU8(
        JSON.stringify({ ...data, scenes }, null, 2),
      );
      const zipped = zipSync(files, { level: 0 });
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(zipped)], { type: 'application/zip' }),
      );
      if (job.current === controller) {
        setZip(url);
        setMessage(`${scenes.length} scene images ready in one ZIP.`);
      } else URL.revokeObjectURL(url);
    } catch (e) {
      if (job.current === controller)
        setMessage(
          controller.signal.aborted
            ? 'Scene export cancelled.'
            : e instanceof Error
              ? e.message
              : 'Scene export failed.',
        );
    } finally {
      if (job.current === controller) {
        job.current = null;
        apply({ ...original, id: 'restore', name: 'Previous view' });
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <details className="camera-controls">
      <summary>Presentation scenes</summary>
      <p>
        Save up to six cameras with lens, materials, lighting and photo
        settings. Stored on this browser and included in complete project
        backups.
      </p>
      <fieldset
        disabled={busy || disabled || !ready}
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        <div className="designer-row">
          <input
            aria-label="Presentation scene name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            disabled={!name.trim() || data.scenes.length >= 6}
            onClick={() => {
              const current = capture();
              if (current)
                save({
                  ...data,
                  scenes: [
                    ...data.scenes,
                    { ...current, id: crypto.randomUUID(), name: name.trim() },
                  ],
                });
            }}
          >
            Save presentation scene
          </button>
        </div>
        <ul>
          {data.scenes.map((scene) => (
            <li key={scene.id}>
              <strong>{scene.name}</strong> · {scene.settings.lens} mm ·{' '}
              {scene.settings.environment} · {scene.settings.variant}{' '}
              <button
                onClick={() => apply(scene)}
                aria-label={`Load scene ${scene.name}`}
              >
                Load
              </button>{' '}
              <button
                onClick={() => {
                  const current = capture();
                  if (current)
                    save({
                      ...data,
                      scenes: data.scenes.map((s) =>
                        s.id === scene.id ? { ...scene, ...current } : s,
                      ),
                    });
                }}
                aria-label={`Update scene ${scene.name}`}
              >
                Update from view
              </button>{' '}
              <button
                onClick={() =>
                  save({
                    ...data,
                    scenes: data.scenes.filter((s) => s.id !== scene.id),
                  })
                }
                aria-label={`Delete scene ${scene.name}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
        <div className="designer-row">
          <button disabled={!data.scenes.length} onClick={downloadSettings}>
            Export scene settings
          </button>
          <label>
            Import scene settings
            <input
              aria-label="Import scene settings"
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  if (file.size > 50000)
                    throw Error('Scene settings exceed 50 KB.');
                  save(parsePresentationScenes(await file.text(), designId));
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : 'Invalid scene settings.',
                  );
                }
              }}
            />
          </label>
          <button
            disabled={!data.scenes.length}
            onClick={() => void batch(true)}
          >
            Export scene previews ZIP
          </button>
          <button
            disabled={!data.scenes.length}
            onClick={() => void batch(false)}
          >
            Export scene photos ZIP
          </button>
        </div>
      </fieldset>
      {busy && (
        <button onClick={() => job.current?.abort()}>
          Cancel scene export
        </button>
      )}
      {zip && (
        <a href={zip} download="presentation-scenes.zip">
          Download scene ZIP
        </a>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
