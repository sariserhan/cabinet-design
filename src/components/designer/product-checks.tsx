'use client';
import { useState } from 'react';
import { z } from 'zod';
import { type Design, isOpening } from '@/designer/model';
import { canonical } from '@/designer/installer-handoff';
import { roomEdges } from '@/designer/room';
import {
  type ProductSupport,
  compatibilityRuleSchema,
  compatibilityResults,
  toleranceRunSchema,
  toleranceResult,
} from '@/designer/product-support';
import { downloadJson } from './business-tools';
export function ProductChecks({
  design,
  value,
  onChange,
  onLocate,
}: {
  design: Design;
  value: ProductSupport;
  onChange: (s: ProductSupport) => void;
  onLocate: (id: string) => void;
}) {
  const [hostId, setHostId] = useState(design.items[0]?.id ?? ''),
    [component, setComponent] = useState(''),
    [reviewer, setReviewer] = useState(''),
    [attested, setAttested] = useState(false),
    [message, setMessage] = useState(''),
    [ids, setIds] = useState<string[]>([]);
  const host = design.items.find((i) => i.id === hostId);
  function act(fn: () => void) {
    try {
      fn();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <>
      <details className="business-panel support-panel">
        <summary>Manufacturer compatibility checks</summary>
        <p>
          Check exact cabinet/component pairs against documented dimensional
          ranges and optional finish/configuration constraints. No rule means
          unverified. Matching one rule does not establish full hardware or
          installation compatibility.
        </p>
        <div className="business-grid">
          <label>
            Host cabinet
            <select
              aria-label="Compatibility host"
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
            >
              <option value="">Choose an item</option>
              {design.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.sku} · {i.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Component SKU
            <input
              aria-label="Compatibility component SKU"
              value={component}
              maxLength={100}
              onChange={(e) => setComponent(e.target.value)}
            />
          </label>
        </div>
        {host &&
          component &&
          compatibilityResults(host, component, value.rules, design).map(
            (r, index) => (
              <article className="purchase-card" key={r.rule?.id ?? index}>
                <strong>
                  {r.status === 'matches_rule'
                    ? 'Matches recorded rule'
                    : r.status === 'mismatch'
                      ? 'Documented mismatch'
                      : 'Unverified'}
                </strong>
                <p>{r.message}</p>
                {r.rule && (
                  <>
                    <p>
                      {r.rule.manufacturer} · {r.rule.source} · revision{' '}
                      {r.rule.revision}
                    </p>
                    {r.rule.url && (
                      <a href={r.rule.url} target="_blank" rel="noreferrer">
                        Open specification source
                      </a>
                    )}
                    <p>
                      {r.rule.review
                        ? `Source reviewed by ${r.rule.review.by}`
                        : 'Source not reviewed in this browser.'}
                    </p>
                    <button
                      disabled={!reviewer.trim() || !attested}
                      onClick={() =>
                        act(() => {
                          onChange({
                            ...value,
                            rules: value.rules.map((rule) =>
                              rule.id === r.rule?.id
                                ? {
                                    ...rule,
                                    review: {
                                      by: reviewer.trim(),
                                      at: new Date().toISOString(),
                                    },
                                  }
                                : rule,
                            ),
                          });
                          setMessage('Source review recorded.');
                        })
                      }
                    >
                      Record source review
                    </button>
                    <button
                      onClick={() =>
                        act(() =>
                          onChange({
                            ...value,
                            rules: value.rules.filter(
                              (rule) => rule.id !== r.rule?.id,
                            ),
                          }),
                        )
                      }
                    >
                      Remove rule
                    </button>
                  </>
                )}
              </article>
            ),
          )}
        <div className="business-grid">
          <label>
            Source reviewer
            <input
              aria-label="Compatibility source reviewer"
              maxLength={120}
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            />
          </label>
          <label className="support-check">
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
            />
            I checked the rule against its cited manufacturer source.
          </label>
        </div>
        <details>
          <summary>Add documented compatibility rule</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              act(() => {
                if (!host) throw Error('Select a host item.');
                const rule = compatibilityRuleSchema.parse({
                  id: crypto.randomUUID(),
                  hostSku: host.sku,
                  componentSku: component,
                  manufacturer: f.get('manufacturer'),
                  componentType: f.get('type'),
                  width: {
                    min: Number(f.get('widthMin')),
                    max: Number(f.get('widthMax')),
                  },
                  depth: {
                    min: Number(f.get('depthMin')),
                    max: Number(f.get('depthMax')),
                  },
                  height: {
                    min: Number(f.get('heightMin')),
                    max: Number(f.get('heightMax')),
                  },
                  hostFinish: f.get('finish'),
                  hostConfiguration: f.get('configuration'),
                  source: f.get('source'),
                  url: f.get('url'),
                  revision: f.get('revision'),
                });
                onChange({ ...value, rules: [...value.rules, rule] });
                setMessage(
                  'Rule added as unverified. Review its source before using the result.',
                );
              });
            }}
          >
            <div className="business-grid">
              <label>
                Manufacturer
                <input
                  name="manufacturer"
                  aria-label="Rule manufacturer"
                  required
                  maxLength={160}
                />
              </label>
              <label>
                Component type
                <select name="type" aria-label="Rule component type">
                  {['hinge', 'drawer', 'sink', 'appliance', 'accessory'].map(
                    (type) => (
                      <option key={type}>{type}</option>
                    ),
                  )}
                </select>
              </label>
              {['width', 'depth', 'height'].flatMap((d) =>
                ['Min', 'Max'].map((bound) => (
                  <label key={d + bound}>
                    {d} {bound.toLowerCase()} (in)
                    <input
                      name={d + bound}
                      aria-label={`Rule ${d} ${bound.toLowerCase()}`}
                      type="number"
                      step="any"
                      min={bound === 'Min' ? 0 : 0.01}
                      max={600}
                      required
                    />
                  </label>
                )),
              )}
              <label>
                Required finish (optional)
                <input
                  name="finish"
                  aria-label="Rule required finish"
                  maxLength={100}
                />
              </label>
              <label>
                Required configuration (optional)
                <input
                  name="configuration"
                  aria-label="Rule required configuration"
                  maxLength={2000}
                />
              </label>
              <label>
                Source document and page
                <input
                  name="source"
                  aria-label="Rule source reference"
                  required
                  maxLength={1000}
                />
              </label>
              <label>
                Source URL (optional)
                <input
                  name="url"
                  aria-label="Rule source URL"
                  type="url"
                  maxLength={2000}
                />
              </label>
              <label>
                Document revision
                <input
                  name="revision"
                  aria-label="Rule revision"
                  required
                  maxLength={120}
                />
              </label>
            </div>
            <button
              disabled={!host || !component.trim() || value.rules.length >= 100}
            >
              Add compatibility rule
            </button>
          </form>
        </details>
        <div className="designer-row">
          <button
            onClick={() =>
              downloadJson(
                {
                  format: 'kitchen-compatibility-rules-v1',
                  rules: value.rules,
                },
                'manufacturer-rules.json',
              )
            }
          >
            Export manufacturer rules
          </button>
          <label>
            Import manufacturer rules
            <input
              aria-label="Import manufacturer rules"
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  if (f.size > 600000) throw Error('Rules exceed 600 KB.');
                  const data = z
                    .object({
                      format: z.literal('kitchen-compatibility-rules-v1'),
                      rules: z.array(compatibilityRuleSchema).max(100),
                    })
                    .parse(JSON.parse(await f.text()));
                  const rules = data.rules.map((r) => {
                    const { review, ...rest } = r;
                    void review;
                    return rest;
                  });
                  onChange({ ...value, rules });
                  setMessage(
                    'Rules imported as unverified; existing rules replaced.',
                  );
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            />
          </label>
        </div>
        <p>
          Import replaces this project’s rules. Export them first to keep a
          copy.
        </p>
        <p role="status">{message}</p>
      </details>
      <details className="business-panel support-panel">
        <summary>Installation tolerance checks</summary>
        <p>
          Check a selected run against a measured straight-wall span. Allowance
          subtracts uncertainty at both ends, total wall unevenness, and
          left/right filler space. These are user-entered field allowances, not
          manufacturer requirements. This is an along-wall projection; depth and
          mounting conditions require separate checks.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            act(() => {
              const run = toleranceRunSchema.parse({
                id: crypto.randomUUID(),
                name: f.get('name'),
                itemIds: ids,
                wall: Number(f.get('wall')),
                start: Number(f.get('start')),
                span: Number(f.get('span')),
                uncertainty: Number(f.get('uncertainty')),
                unevenness: Number(f.get('unevenness')),
                leftFiller: Number(f.get('leftFiller')),
                rightFiller: Number(f.get('rightFiller')),
                measuredBy: f.get('measuredBy'),
                note: f.get('note'),
                roomSignature: canonical(design.room),
              });
              onChange({ ...value, runs: [...value.runs, run] });
              setMessage('Measured run saved.');
            });
          }}
        >
          <fieldset>
            <legend>Items in the measured run</legend>
            {design.items
              .filter((i) => !isOpening(i))
              .map((i) => (
                <label className="support-check" key={i.id}>
                  <input
                    type="checkbox"
                    aria-label={`Tolerance item ${i.sku} ${i.id}`}
                    checked={ids.includes(i.id)}
                    onChange={(e) =>
                      setIds(
                        e.target.checked
                          ? [...ids, i.id]
                          : ids.filter((id) => id !== i.id),
                      )
                    }
                  />
                  {i.sku} · {i.id.slice(0, 8)}
                </label>
              ))}
          </fieldset>
          <div className="business-grid">
            <label>
              Run name
              <input
                name="name"
                aria-label="Tolerance run name"
                required
                maxLength={120}
              />
            </label>
            <label>
              Wall
              <select name="wall" aria-label="Tolerance wall">
                {roomEdges(design.room).map((w) => (
                  <option key={w.index} value={w.index}>
                    Wall {w.index + 1} · {w.side}
                    {w.curved ? ' (curved: unverified)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {[
              ['start', 'Start offset (in)', 600],
              ['span', 'Measured usable span (in)', 600],
              ['uncertainty', 'Uncertainty per end (in)', 12],
              ['unevenness', 'Total wall unevenness (in)', 12],
              ['leftFiller', 'Left filler allowance (in)', 24],
              ['rightFiller', 'Right filler allowance (in)', 24],
            ].map(([key, label, max]) => (
              <label key={key}>
                {label}
                <input
                  name={String(key)}
                  aria-label={String(label)}
                  type="number"
                  step="any"
                  min={key === 'span' ? 0.01 : 0}
                  max={Number(max)}
                  required
                  defaultValue={key === 'span' ? '' : 0}
                />
              </label>
            ))}
            <label>
              Measured by
              <input
                name="measuredBy"
                aria-label="Tolerance measured by"
                required
                maxLength={120}
              />
            </label>
            <label>
              Measurement notes
              <textarea
                name="note"
                aria-label="Tolerance notes"
                maxLength={1000}
              />
            </label>
          </div>
          <button disabled={!ids.length || value.runs.length >= 20}>
            Save measured run
          </button>
        </form>
        {value.runs.map((r) => {
          const result = toleranceResult(design, r);
          return (
            <article key={r.id} className="purchase-card">
              <h3>{r.name}</h3>
              <strong>
                {result.status === 'fits_allowance'
                  ? 'Fits entered allowances'
                  : result.status === 'insufficient'
                    ? 'Insufficient adjustment space'
                    : 'Unverified'}
              </strong>
              <p>{result.message}</p>
              <p>
                Measured by {r.measuredBy}. {r.note}
              </p>
              <button onClick={() => onLocate(r.itemIds[0] ?? '')}>
                Locate measured run
              </button>
              <button
                onClick={() =>
                  act(() =>
                    onChange({
                      ...value,
                      runs: value.runs.filter((run) => run.id !== r.id),
                    }),
                  )
                }
              >
                Remove measured run
              </button>
            </article>
          );
        })}
        <button
          onClick={() =>
            downloadJson(
              {
                designId: design.id,
                runs: value.runs.map((r) => ({
                  ...r,
                  result: toleranceResult(design, r),
                })),
              },
              'installation-tolerances.json',
            )
          }
        >
          Export tolerance checks
        </button>
        <p role="status">{message}</p>
      </details>
    </>
  );
}
