import { z } from 'zod';
import { type Design, designSchema } from './model';
import { canonical } from './installer-handoff';
import {
  selectionBoardSchema,
  type SelectionCard,
  type SelectionBoard,
} from './selection-schema';
export type { SelectionCard, SelectionBoard } from './selection-schema';
export function starterBoard(): SelectionBoard {
  return {
    clientName: '',
    cards: [
      {
        id: crypto.randomUUID(),
        name: 'Warm & natural',
        cabinet: 'oak',
        countertop: 'quartz',
        flooring: 'tile',
        hardware: 'brass',
        favorite: false,
        reason: '',
      },
      {
        id: crypto.randomUUID(),
        name: 'Light & classic',
        cabinet: 'linen',
        countertop: 'marble',
        flooring: 'oak',
        hardware: 'steel',
        favorite: false,
        reason: '',
      },
      {
        id: crypto.randomUUID(),
        name: 'Dark & calm',
        cabinet: 'slate',
        countertop: 'granite',
        flooring: 'walnut',
        hardware: 'black',
        favorite: false,
        reason: '',
      },
    ],
  };
}
export function boardSignature(board: SelectionBoard) {
  return canonical(
    board.cards.map((c) => ({
      id: c.id,
      name: c.name,
      cabinet: c.cabinet,
      countertop: c.countertop,
      flooring: c.flooring,
      hardware: c.hardware,
    })),
  );
}
export function applySelection(d: Design, card: SelectionCard): Design {
  return designSchema.parse({
    ...d,
    finish: card.cabinet,
    appearance: {
      lighting: 'daylight',
      ...d.appearance,
      flooring: card.flooring,
      hardware: card.hardware,
      countertop: card.countertop,
    },
    items: d.items.map((i) => ({
      ...i,
      ...([
        'cabinet',
        'custom_cabinet',
        'corner',
        'island',
        'filler',
        'trim',
        'molding',
        'toe_kick',
      ].includes(i.kind)
        ? { finish: card.cabinet }
        : {}),
      ...(i.kind === 'countertop' ? { countertop: card.countertop } : {}),
    })),
  });
}
export function selectionPackage(d: Design) {
  if (!d.selectionBoard?.cards.length)
    throw Error('Add selection cards first.');
  return {
    format: 'kitchen-selections-v1',
    design: designSchema.parse({
      format: d.format,
      id: d.id,
      name: d.name,
      room: d.room,
      items: d.items,
      finish: d.finish,
      appearance: d.appearance,
      selectionBoard: d.selectionBoard,
    }),
  };
}
export function parseSelectionPackage(text: string) {
  if (text.length > 600000) throw Error('Selection file is too large.');
  return z
    .object({
      format: z.literal('kitchen-selections-v1'),
      design: designSchema,
    })
    .parse(JSON.parse(text));
}
export function selectionResponse(source: Design, board: SelectionBoard) {
  if (!source.selectionBoard) throw Error('Selection board missing.');
  return {
    format: 'kitchen-selection-response-v1',
    designId: source.id,
    baseline: boardSignature(source.selectionBoard),
    board,
  };
}
export function mergeSelectionResponse(d: Design, text: string): Design {
  if (text.length > 100000) throw Error('Selection response is too large.');
  const r = z
    .object({
      format: z.literal('kitchen-selection-response-v1'),
      designId: z.string(),
      baseline: z.string().max(20000),
      board: selectionBoardSchema,
    })
    .parse(JSON.parse(text));
  if (
    r.designId !== d.id ||
    !d.selectionBoard ||
    r.baseline !== boardSignature(d.selectionBoard) ||
    r.baseline !== boardSignature(r.board)
  )
    throw Error(
      'The selection board changed. Send a fresh board before importing preferences.',
    );
  if (!r.board.clientName.trim()) throw Error('Client name is required.');
  return designSchema.parse({ ...d, selectionBoard: r.board });
}
