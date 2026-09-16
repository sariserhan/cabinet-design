'use client';

import { useEffect, useRef, useState } from 'react';
import { renderPhoto } from './photo-render';
import type { RenderAssets } from './render-assets';
import type { RenderSettings } from '@/designer/render-settings';
import type { Design } from '@/designer/model';
import type { RenderActions } from './render-controls';

/**
 * Owns the path-traced photo export: its settings, the in-flight job and the
 * resulting image. Kept out of RenderView so the long-running render has one
 * place to start, report progress and abort.
 *
 * `describe` returns the design fingerprint stamped on the finished image. It
 * is a callback because RenderView computes that fingerprint from state this
 * hook itself provides.
 */
export function usePhotoExport({
  design,
  describe,
  actions,
  exportWidth,
  assets,
  environmentKind,
  whiteBalance,
  autoBalance,
  adaptive,
}: {
  design: Design;
  describe: () => string;
  actions: React.RefObject<RenderActions | null>;
  exportWidth: number;
  assets: RenderAssets | null;
  environmentKind: RenderSettings['environment'];
  whiteBalance: [number, number, number];
  autoBalance: boolean;
  adaptive: boolean;
}) {
  const [photoSamples, setPhotoSamples] = useState(64);
  const [photoDenoise, setPhotoDenoise] = useState(true);
  const [photoProgress, setPhotoProgress] = useState<number | null>(null);
  const [photoMessage, setPhotoMessage] = useState('');
  const [photoResult, setPhotoResult] = useState<{
    url: string;
    name: string;
    designVersion: string;
  } | null>(null);
  const photoJob = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      photoJob.current?.abort();
      photoJob.current = null;
    },
    [],
  );
  async function startPhoto(preview = false) {
    if (!actions.current || photoJob.current) return;
    const designVersion = describe();
    const job = new AbortController();
    photoJob.current = job;
    setPhotoProgress(0);
    setPhotoResult(null);
    setPhotoMessage('Preparing geometry and lighting…');
    const name = `${design.name.replace(/[^a-z0-9-]/gi, '-').slice(0, 80) || 'kitchen'}-${preview ? 'photo-preview' : 'photo'}.png`;
    try {
      const captured = actions.current.snapshot();
      const samples = preview ? 8 : photoSamples;
      const url = await renderPhoto(captured.snapshot, captured.camera, {
        width: preview ? 640 : exportWidth,
        samples,
        exposure: captured.exposure,
        denoise: photoDenoise,
        environment: assets ? environmentKind : 'studio',
        whiteBalance,
        autoBalance,
        adaptive,
        onStatus: setPhotoMessage,
        signal: job.signal,
        onProgress: (n) => {
          if (photoJob.current === job) {
            setPhotoProgress(n / samples);
            setPhotoMessage(`Rendering ${Math.round((n / samples) * 100)}%`);
          }
        },
      });
      if (photoJob.current === job) {
        setPhotoResult({ url, name, designVersion });
        setPhotoMessage(
          preview
            ? 'Preview ready. Final quality uses more samples to reduce noise.'
            : 'Photo render ready.',
        );
      }
    } catch (e) {
      if (photoJob.current === job)
        setPhotoMessage(
          job.signal.aborted
            ? 'Photo render cancelled.'
            : e instanceof Error
              ? e.message
              : 'Photo render failed.',
        );
    } finally {
      if (photoJob.current === job) {
        photoJob.current = null;
        setPhotoProgress(null);
      }
    }
  }

  return {
    photoSamples,
    setPhotoSamples,
    photoDenoise,
    setPhotoDenoise,
    photoProgress,
    photoMessage,
    photoResult,
    photoJob,
    startPhoto,
  };
}
