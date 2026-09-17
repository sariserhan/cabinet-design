'use client';

import type { Dispatch, SetStateAction } from 'react';
import type * as THREE from 'three';
import type { Design } from '@/designer/model';
import type { RenderSettings } from '@/designer/render-settings';
import type { UpdateView, ViewState } from './render-state';
import { presentationViews } from '@/designer/render-planning';
import { imageBalance } from '@/designer/image-quality';
import { photoSnapshot } from './photo-render';
import { Working, useWorking } from './working';
import type { CameraView } from './render-view';

type View = NonNullable<Design['views']>[number];

/** Imperative handles the scene publishes for the controls to drive. */
export type RenderActions = {
  expose: (value: number) => void;
  balance: (value: [number, number, number]) => void;
  meter: () => ReturnType<typeof imageBalance>;
  lens: (value: number) => void;
  snapshot: () => {
    snapshot: ReturnType<typeof photoSnapshot>;
    camera: THREE.PerspectiveCamera;
    exposure: number;
  };
  walk: (forward: number, side: number, turn?: number) => void;
  open: (amount: number) => void;
  fit: () => void;
  /** Draw one more frame, for a setting the scene does not rebuild for. */
  refresh: () => void;
  /** An equirectangular 360 image, from standing height inside the room. */
  panorama: (width: number) => void;
  save: (width: number, captureOnly?: boolean) => void;
  capture: () => Pick<View, 'position' | 'target'>;
  load: (view: CameraView) => void;
};

/**
 * The render panel: every control that changes how the scene is presented or
 * exported. It owns no state itself — RenderView holds the view state and
 * passes it as one object with one updater, so adding an option does not widen
 * this prop list.
 */
export type RenderControlsProps = {
  view: ViewState;
  update: UpdateView;
  actions: React.RefObject<RenderActions | null>;
  photoJob: React.RefObject<AbortController | null>;
  design: Design;
  designVersion: string;
  assetsLoading: boolean;
  error: string;
  startPhoto: (preview?: boolean) => Promise<void>;
  onChange: (design: Design) => void;
  onCamera?: (view: CameraView) => void;
  onCapture?: (url: string) => void;
  photoDenoise: boolean;
  setPhotoDenoise: Dispatch<SetStateAction<boolean>>;
  photoMessage: string;
  photoProgress: number | null;
  photoResult: { url: string; name: string; designVersion: string } | null;
  photoSamples: number;
  setPhotoSamples: Dispatch<SetStateAction<number>>;
};

export function RenderControls({
  view,
  update,
  actions,
  photoJob,
  design,
  designVersion,
  assetsLoading,
  error,
  startPhoto,
  onChange,
  onCamera,
  onCapture,
  photoDenoise,
  setPhotoDenoise,
  photoMessage,
  photoProgress,
  photoResult,
  photoSamples,
  setPhotoSamples,
}: RenderControlsProps) {
  // Exporting a still or a panorama renders the scene again, at several
  // times the size of the view, on the main thread: seconds of a page
  // that answers nothing. It says what it is doing now.
  const { working, run } = useWorking();
  // Destructured so the markup below still reads each field by name.
  const {
    variant,
    environmentKind,
    scanned,
    whiteBalance,
    autoBalance,
    adaptive,
    exportWidth,
    lens,
    exposure,
    quality,
    walking,
    opening,
    cutaway,
    interiors,
    showCeiling,
  } = view;
  return (
    <div className="designer-row render-controls">
      <details className="render-menu">
        <summary>Camera & walk</summary>
        <div className="render-menu-content designer-row">
          <label>
            Camera lens
            <select
              aria-label="Camera focal length"
              value={lens}
              onChange={(e) => update({ lens: Number(e.target.value) })}
            >
              {![28, 35, 45, 60].includes(lens) && (
                <option value={lens}>{lens} mm · saved</option>
              )}
              <option value={28}>28 mm · wide room</option>
              <option value={35}>35 mm · interior</option>
              <option value={45}>45 mm · natural</option>
              <option value={60}>60 mm · detail</option>
            </select>
          </label>{' '}
          <select
            aria-label="Presentation camera angle"
            defaultValue=""
            onChange={(e) => {
              const view = presentationViews(design).find(
                (v) => v.id === e.target.value,
              );
              if (view) {
                update({ walking: false });
                actions.current?.load(view);
                onCamera?.(view);
              }
            }}
          >
            <option value="">Choose presentation angle</option>
            {presentationViews(design).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={walking}
              onChange={(e) => update({ walking: e.target.checked })}
            />{' '}
            Eye-level walkthrough
          </label>
          <button
            onClick={() => {
              actions.current?.fit();
              const view = actions.current?.capture();
              if (view) onCamera?.(view);
            }}
          >
            Reset camera
          </button>
        </div>
      </details>
      <details className="render-menu">
        <summary>Lighting & scene</summary>
        <div className="render-menu-content designer-row">
          <label>
            Environment{' '}
            <select
              aria-label="Render environment"
              value={environmentKind}
              onChange={(e) =>
                update({
                  environmentKind: e.target
                    .value as RenderSettings['environment'],
                })
              }
            >
              <option value="garden">Garden HDR daylight</option>
              <option value="studio">Studio</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={scanned}
              onChange={(e) => update({ scanned: e.target.checked })}
            />{' '}
            Detailed PBR materials
          </label>
          <button
            onClick={() => {
              const measured = actions.current?.meter();
              if (measured) {
                update({
                  exposure: Math.max(
                    0.25,
                    Math.min(4, exposure * measured.exposure),
                  ),
                });
                update({
                  whiteBalance: whiteBalance.map((v, i) =>
                    Math.max(
                      0.5,
                      Math.min(2, v * (measured.whiteBalance[i] ?? 1)),
                    ),
                  ) as [number, number, number],
                });
              }
            }}
          >
            Auto balance view
          </button>
          <button
            onClick={() => {
              update({ whiteBalance: [1, 1, 1] });
              update({ exposure: 1 });
            }}
          >
            Reset image balance
          </button>
          <small>
            Illustrative CC0 materials and garden panorama from Poly Haven /
            ambientCG.{' '}
            <a
              href="/render-assets/CREDITS.md"
              target="_blank"
              rel="noreferrer"
            >
              Asset credits
            </a>
          </small>
          <label>
            Lighting
            <select
              aria-label="Render lighting"
              value={design.appearance?.lighting ?? 'daylight'}
              onChange={(e) =>
                update({
                  lightingOverride: e.target
                    .value as RenderSettings['lighting'],
                })
              }
            >
              <option value="daylight">Daylight</option>
              <option value="warm">Warm evening</option>
              <option value="studio">Studio</option>
            </select>
          </label>{' '}
          <label>
            Exposure · {exposure.toFixed(2)}
            <input
              aria-label="Render exposure"
              type="range"
              min="0.5"
              max="1.8"
              step="0.05"
              value={exposure}
              onChange={(e) => update({ exposure: Number(e.target.value) })}
            />
          </label>
          <button type="button" onClick={() => update({ exposure: 1 })}>
            Reset exposure
          </button>
          <label>
            <input
              type="checkbox"
              checked={quality}
              aria-label="High quality shadows"
              onChange={(e) => update({ quality: e.target.checked })}
            />{' '}
            High quality shadows & room reflections
          </label>
          <label>
            <input
              type="checkbox"
              checked={showCeiling}
              onChange={(e) => update({ showCeiling: e.target.checked })}
            />{' '}
            Show ceiling
          </label>
          <label>
            <input
              type="checkbox"
              checked={cutaway}
              onChange={(e) => update({ cutaway: e.target.checked })}
            />{' '}
            Cutaway walls
          </label>
        </div>
      </details>
      <details className="render-menu">
        <summary>Cabinet fronts</summary>
        <div className="render-menu-content designer-row">
          {' '}
          <label>
            Front opening (%)
            <input
              aria-label="Front opening (%)"
              type="range"
              min="0"
              max="100"
              value={opening}
              onChange={(e) => {
                const value = Number(e.target.value);
                update({ opening: value });
                actions.current?.open(value);
              }}
            />
          </label>
          <button
            onClick={() => {
              update({ opening: opening ? 0 : 100 });
              actions.current?.open(opening ? 0 : 100);
            }}
          >
            {opening ? 'Close fronts' : 'Open fronts'}
          </button>{' '}
          <label>
            <input
              type="checkbox"
              checked={interiors}
              onChange={(e) => update({ interiors: e.target.checked })}
            />{' '}
            Show interiors
          </label>
        </div>
      </details>
      <details className="render-menu">
        <summary>Compare materials</summary>
        <div className="render-menu-content designer-row">
          <p>
            Compare finishes from the same camera. Preview changes are temporary
            until applied.
          </p>
          <select
            aria-label="Material preview"
            value={variant}
            onChange={(e) => update({ variant: e.target.value })}
          >
            <option value="original">Original design</option>
            <option value="oak">Warm oak / quartz</option>
            <option value="white">Soft white / quartz</option>
            <option value="dark">Dark slate / marble</option>
          </select>
          <button
            disabled={variant === 'original'}
            onClick={() => update({ variant: 'original' })}
          >
            Show original
          </button>
          <button
            disabled={variant === 'original'}
            onClick={() => {
              onChange(design);
              update({ variant: 'original' });
            }}
          >
            Apply preview materials
          </button>
        </div>
      </details>
      <details className="render-menu">
        <summary>Export image</summary>
        <div className="render-menu-content designer-row">
          {' '}
          {onCapture && (
            <button
              disabled={!!error || assetsLoading}
              onClick={() => actions.current?.save(1920, true)}
            >
              Capture presentation view
            </button>
          )}
          <label>
            PNG width
            <select
              aria-label="Render export width"
              value={exportWidth}
              onChange={(e) => update({ exportWidth: Number(e.target.value) })}
            >
              <option value={1280}>1280 px · web</option>
              <option value={1920}>1920 px</option>
              <option value={3840}>3840 px</option>
            </select>
          </label>
          <button
            onClick={() =>
              void run(`Rendering the ${exportWidth} px image…`, () =>
                actions.current?.save(exportWidth),
              )
            }
            disabled={!!error || assetsLoading || !!working}
          >
            Download PNG
          </button>
          <button
            onClick={() =>
              void run('Rendering the panorama…', () =>
                actions.current?.panorama(2048),
              )
            }
            disabled={!!error || assetsLoading || !!working}
            title="An equirectangular image, taken standing in the open floor of the room"
          >
            Download 360 panorama
          </button>
          {working && <Working label={working} />}
          {!showCeiling && (
            <small>
              A panorama looks overhead as well as around: turn the ceiling on
              first, or the room is open to the sky.
            </small>
          )}
          <label>
            <input
              type="checkbox"
              checked={photoDenoise}
              onChange={(e) => setPhotoDenoise(e.target.checked)}
            />{' '}
            Reduce photo noise
          </label>
          <label>
            <input
              type="checkbox"
              checked={autoBalance}
              onChange={(e) => update({ autoBalance: e.target.checked })}
            />{' '}
            Automatic photo exposure and white balance
          </label>
          <label>
            <input
              type="checkbox"
              checked={adaptive}
              onChange={(e) => update({ adaptive: e.target.checked })}
            />{' '}
            Refine noisy regions
          </label>
          <label>
            Photo quality
            <select
              aria-label="Photo quality"
              value={photoSamples}
              onChange={(e) => setPhotoSamples(Number(e.target.value))}
            >
              <option value={32}>32 samples · quicker</option>
              <option value={64}>64 samples · balanced</option>
              <option value={128}>128 samples · cleaner</option>
            </select>
          </label>
          <button
            disabled={photoProgress !== null || !!error || assetsLoading}
            onClick={() => void startPhoto(true)}
          >
            Preview photo render
          </button>
          <button
            disabled={photoProgress !== null || !!error || assetsLoading}
            onClick={() => void startPhoto()}
          >
            Render final photo
          </button>
          {photoProgress !== null && (
            <>
              <progress
                aria-label="Photo render progress"
                max={1}
                value={photoProgress}
              />
              <button onClick={() => photoJob.current?.abort()}>
                Cancel photo render
              </button>
            </>
          )}
          <p role="status">{photoMessage}</p>
          <p>
            Photo rendering traces bounced light and kitchen reflections. It can
            take several minutes. Use Show ceiling for an enclosed interior; the
            current camera and cutaway settings are captured.
          </p>
          {photoResult && (
            <div>
              {photoResult.designVersion !== designVersion && (
                <p>
                  Design changed. Render a new photo before adding it to this
                  presentation.
                </p>
              )}
              <a href={photoResult.url} download={photoResult.name}>
                Download photo PNG
              </a>
              {onCapture && (
                <button
                  disabled={photoResult.designVersion !== designVersion}
                  onClick={() => onCapture(photoResult.url)}
                >
                  Use photo in presentation
                </button>
              )}
              <img
                src={photoResult.url}
                alt="Completed kitchen photo render"
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  height: 'auto',
                  marginTop: 12,
                }}
              />
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
