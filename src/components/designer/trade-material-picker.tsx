'use client';
import { useState } from 'react';
import type { Trade, TradeInput } from '@/designer/trade-estimates';
import {
  tradeMaterials,
  applyTradeMaterial,
  materialMatches,
} from '@/designer/trade-material-catalog';

const labels = {
  slabWidth: 'Slab width (in)',
  slabDepth: 'Slab depth (in)',
  boxCoverage: 'Carton coverage (sq ft)',
  coverage: 'Coverage (sq ft / gallon / coat)',
  tileWidth: 'Tile width (in)',
  tileHeight: 'Tile height (in)',
  tilesPerBox: 'Tiles per box',
};
export function TradeMaterialPicker({
  trade,
  input,
  onChange,
}: {
  trade: Trade;
  input: TradeInput;
  onChange: (changes: Partial<TradeInput>) => void;
}) {
  const [search, setSearch] = useState('');
  const entries = tradeMaterials.filter(
    (m) =>
      m.trade === trade &&
      `${m.manufacturer} ${m.name}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <fieldset className="trade-material-picker">
      <legend>Manufacturer material catalog</legend>
      <p>
        Starter selection · public specifications · supplier prices entered
        separately.
      </p>
      {input.materialCatalog && (
        <div className="trade-status">
          <strong>
            {input.materialCatalog.manufacturer} · {input.materialCatalog.name}
          </strong>
          <p>
            {materialMatches(input)
              ? 'Profile specifications applied'
              : 'Customized product or specifications'}{' '}
            · source checked {input.materialCatalog.checkedAt}
          </p>
          <a
            href={input.materialCatalog.source}
            target="_blank"
            rel="noreferrer"
          >
            Selected material source
          </a>{' '}
          <button
            type="button"
            onClick={() => onChange({ materialCatalog: undefined })}
          >
            Use as custom material
          </button>
        </div>
      )}
      <label>
        Find a material
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Manufacturer or product"
        />
      </label>
      <div className="trade-material-list">
        {entries.map((m) => (
          <article key={m.id}>
            <h4>
              {m.manufacturer} · {m.name}
            </h4>
            <p>
              {Object.entries(m.specs)
                .map(
                  ([key, value]) =>
                    `${labels[key as keyof typeof labels]}: ${value}`,
                )
                .join(' · ')}
            </p>
            <p>{m.note}</p>
            <a href={m.source} target="_blank" rel="noreferrer">
              Manufacturer specifications
            </a>
            <small>Checked {m.checkedAt}</small>
            <button
              type="button"
              onClick={() => onChange(applyTradeMaterial(trade, input, m))}
            >
              Use {m.name}
            </button>
          </article>
        ))}
        {!entries.length && (
          <p>No matching catalog products. Enter a custom material below.</p>
        )}
      </div>
      <p>
        Selecting a product replaces its estimating specifications and clears
        the material price and price reference. Confirm availability with your
        supplier.
      </p>
    </fieldset>
  );
}
