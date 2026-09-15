'use client';
import { useState } from 'react';
import type { Design } from '@/designer/model';
import {
  parseSelectionPackage,
  selectionResponse,
  type SelectionBoard,
} from '@/designer/selection-board';
import { SelectionCards } from '@/components/designer/selection-board';
import { downloadJson } from '@/components/designer/business-tools';
export default function SelectionsPage() {
  const [source, setSource] = useState<Design | null>(null),
    [board, setBoard] = useState<SelectionBoard | null>(null),
    [message, setMessage] = useState('');
  return (
    <main className="client-review installer-page">
      <header>
        <p>Kitchen Studio · Your choices</p>
        <h1>Client selection workspace</h1>
        <p>
          Open your designer’s board, choose favorites and leave your reasons.
          Download your preferences to return them. Changes stay in this tab
          until downloaded.
        </p>
      </header>
      <label>
        Open selection board
        <input
          aria-label="Open selection board"
          type="file"
          accept=".json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              if (file.size > 600000)
                throw Error('Selection file is too large.');
              const pack = parseSelectionPackage(await file.text());
              if (!pack.design.selectionBoard?.cards.length)
                throw Error('This file contains no selection cards.');
              setSource(pack.design);
              setBoard(pack.design.selectionBoard);
              setMessage('Board opened.');
            } catch (error) {
              setMessage((error as Error).message);
            }
          }}
        />
      </label>
      <p role="status">{message}</p>
      {source && board && (
        <>
          <h2>{source.name}</h2>
          <button
            disabled={!board.clientName.trim()}
            onClick={() =>
              downloadJson(
                selectionResponse(source, board),
                'kitchen-selection-preferences.json',
              )
            }
          >
            Download my preferences
          </button>
          <SelectionCards
            design={source}
            board={board}
            editable={false}
            onChange={setBoard}
          />
        </>
      )}
    </main>
  );
}
