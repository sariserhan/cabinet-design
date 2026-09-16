import type { Design } from '@/designer/model';

/** Undo/redo stack for the design under edit. */
export type History = {
  past: Design[];
  current: Design;
  future: Design[];
  error?: string;
};

/** The primary steps of the kitchen workflow, in order. */
export type WorkspaceStage =
  'Room' | 'Cabinets' | 'Design' | 'Quote' | 'Present';

/** Which view fills the centre of the designer grid. */
export type ViewMode =
  '2d' | '3d' | 'render' | 'elevation' | 'quote' | 'client' | 'compare';
