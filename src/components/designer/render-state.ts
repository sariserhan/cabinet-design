import type { RenderSettings } from '@/designer/render-settings';

/**
 * Everything the render panel can change about how the scene is shown or
 * exported, in one object.
 *
 * These were seventeen separate useState hooks, which meant the controls
 * component took a setter per field and its prop list grew with every new
 * option. One value plus one `update` keeps that surface flat.
 */
export type ViewState = {
  variant: string;
  lightingOverride: RenderSettings['lighting'] | null;
  lightingProfileOverride: RenderSettings['lightingProfile'] | null;
  environmentKind: RenderSettings['environment'];
  scanned: boolean;
  whiteBalance: [number, number, number];
  autoBalance: boolean;
  adaptive: boolean;
  exportWidth: number;
  lens: number;
  exposure: number;
  quality: boolean;
  walking: boolean;
  opening: number;
  cutaway: boolean;
  interiors: boolean;
  showCeiling: boolean;
};

export const initialViewState: ViewState = {
  variant: 'original',
  lightingOverride: null,
  lightingProfileOverride: null,
  environmentKind: 'garden',
  scanned: true,
  whiteBalance: [1, 1, 1],
  autoBalance: true,
  adaptive: true,
  exportWidth: 1920,
  lens: 45,
  exposure: 1,
  quality: false,
  walking: false,
  opening: 0,
  cutaway: true,
  interiors: false,
  showCeiling: false,
};

/** Applies a partial change to the view state. */
export type UpdateView = (patch: Partial<ViewState>) => void;
