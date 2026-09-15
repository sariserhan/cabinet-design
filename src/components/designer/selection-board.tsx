'use client';
import { useState } from 'react';
import type { Design } from '@/designer/model';
import {
  applySelection,
  starterBoard,
  selectionPackage,
  mergeSelectionResponse,
  type SelectionBoard,
  type SelectionCard,
} from '@/designer/selection-board';
import { downloadJson } from './business-tools';
import { Preview } from './preview';
const palette: Record<string, string> = {
  linen: '#e2d9c6',
  oak: '#cba878',
  slate: '#58686f',
  quartz: '#eee9df',
  marble: '#dce0df',
  granite: '#777976',
  walnut: '#76533b',
  tile: '#d4cec1',
  steel: '#a7b4bb',
  brass: '#b18a43',
  black: '#303333',
};
export function SelectionCards({
  design,
  board,
  onChange,
  editable,
  onApply,
}: {
  design: Design;
  board: SelectionBoard;
  onChange: (b: SelectionBoard) => void;
  editable: boolean;
  onApply?: (c: SelectionCard) => void;
}) {
  const update = (id: string, patch: Partial<SelectionCard>) =>
    onChange({
      ...board,
      cards: board.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  return (
    <>
      <label>
        Client name
        <input
          aria-label="Selection client name"
          maxLength={120}
          value={board.clientName}
          onChange={(e) => onChange({ ...board, clientName: e.target.value })}
        />
      </label>
      <p>
        Compare illustrative combinations, save favorites and explain what you
        like. Confirm physical samples and supplier availability before
        ordering.
      </p>
      <div className="proposal-grid">
        {board.cards.map((card) => (
          <article className="decision-card selection-card" key={card.id}>
            {editable ? (
              <label>
                Combination name
                <input
                  aria-label={`Combination name: ${card.name}`}
                  maxLength={100}
                  value={card.name}
                  onChange={(e) => {
                    if (e.target.value.trim())
                      update(card.id, { name: e.target.value });
                  }}
                />
              </label>
            ) : (
              <h3>{card.name}</h3>
            )}
            <Preview
              design={applySelection(design, card)}
              selected={null}
              onSelect={() => {}}
            />
            <div className="material-swatches">
              {(['cabinet', 'countertop', 'flooring', 'hardware'] as const).map(
                (field) => (
                  <div key={field}>
                    <span style={{ background: palette[card[field]] }} />
                    <small>
                      {field}
                      <br />
                      {card[field]}
                    </small>
                  </div>
                ),
              )}
            </div>
            {editable && (
              <div className="business-grid">
                {(
                  [
                    ['cabinet', ['linen', 'oak', 'slate']],
                    ['countertop', ['quartz', 'marble', 'granite']],
                    ['flooring', ['oak', 'walnut', 'tile', 'slate']],
                    ['hardware', ['steel', 'brass', 'black']],
                  ] as const
                ).map(([field, options]) => (
                  <label key={field}>
                    {field}
                    <select
                      aria-label={`${card.name} ${field}`}
                      value={card[field]}
                      onChange={(e) =>
                        update(card.id, { [field]: e.target.value })
                      }
                    >
                      {options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <label className="decision-check">
              <input
                type="checkbox"
                aria-label={`Favorite ${card.name}`}
                checked={card.favorite}
                onChange={(e) =>
                  update(card.id, { favorite: e.target.checked })
                }
              />
              Favorite this combination
            </label>
            <label>
              Why this works for you
              <textarea
                aria-label={`Reason: ${card.name}`}
                maxLength={1000}
                value={card.reason}
                onChange={(e) => update(card.id, { reason: e.target.value })}
              />
            </label>
            {onApply && (
              <button onClick={() => onApply(card)}>
                Preview {card.name} on design
              </button>
            )}
            {editable && (
              <button
                onClick={() =>
                  onChange({
                    ...board,
                    cards: board.cards.filter((c) => c.id !== card.id),
                  })
                }
              >
                Remove {card.name}
              </button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
export function ClientSelectionBoard({
  design,
  onChange,
  onPreview,
}: {
  design: Design;
  onChange: (d: Design) => void;
  onPreview: (d: Design, label: string) => void;
}) {
  const [message, setMessage] = useState('');
  const board = design.selectionBoard;
  return (
    <section>
      <h3>Client selection board</h3>
      <p>
        Prepare combinations, export the board, and let your client open it in
        the selection workspace. Returned preferences update this board;
        applying a look uses the change preview and recalculates quote coverage.
      </p>
      <div className="designer-row">
        <button
          disabled={!!board && board.cards.length >= 8}
          onClick={() =>
            onChange({
              ...design,
              selectionBoard: board
                ? {
                    ...board,
                    cards: [
                      ...board.cards,
                      {
                        ...(starterBoard().cards[0] as SelectionCard),
                        name: `Combination ${board.cards.length + 1}`,
                      },
                    ],
                  }
                : starterBoard(),
            })
          }
        >
          {board ? 'Add combination' : 'Create selection board'}
        </button>
        <button
          disabled={!board?.cards.length}
          onClick={() => {
            try {
              downloadJson(selectionPackage(design), 'kitchen-selections.json');
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Export client selection board
        </button>
        <a href="/selections" target="_blank" rel="noreferrer">
          Open client selection workspace
        </a>
        <label>
          Import client preferences
          <input
            aria-label="Import client preferences"
            type="file"
            accept=".json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > 100000) throw Error('Response is too large.');
                onChange(mergeSelectionResponse(design, await file.text()));
                setMessage(
                  'Client preferences imported. Review favorites before applying a combination.',
                );
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          />
        </label>
      </div>
      <p role="status">{message}</p>
      {board && (
        <SelectionCards
          design={design}
          board={board}
          editable
          onChange={(selectionBoard) => onChange({ ...design, selectionBoard })}
          onApply={(card) =>
            onPreview(
              applySelection(design, card),
              `Material selection: ${card.name}`,
            )
          }
        />
      )}
    </section>
  );
}
