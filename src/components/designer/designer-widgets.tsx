'use client';

import { useEffect, useState } from 'react';
import {
  fromDisplay,
  roundDisplay,
  stepFor,
  toDisplay,
  unitSuffix,
} from '@/designer/units';
import type { Units } from '@/designer/units';

/** A numeric field that only commits valid, in-range values on blur or Enter. */
/**
 * A length field.
 *
 * The value it is given and the value it reports are inches, because that
 * is what the design stores. What it shows and what it accepts is whatever
 * unit the project works in, so a metric project types 610 where an
 * imperial one types 24. The label carries the unit, and `(in)` in a
 * caller's label is replaced rather than repeated.
 */
export function Numeric({
  label,
  value,
  min = 0,
  max = 600,
  units = 'in',
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  units?: Units;
  onChange: (n: number) => void;
}) {
  const shown = (n: number) => String(roundDisplay(toDisplay(n, units), units));
  const [text, setText] = useState(shown(value));
  useEffect(() => setText(shown(value)), [value, units]);
  const name = label.replace(/\((in|mm)\)/, `(${unitSuffix(units)})`);
  function submit() {
    const typed = Number(text);
    const next = fromDisplay(typed, units);
    if (text.trim() && Number.isFinite(next) && next >= min && next <= max)
      onChange(next);
    else setText(shown(value));
  }
  return (
    <label className="designer-numeric">
      <span>{name}</span>
      <input
        type="number"
        aria-label={name}
        min={roundDisplay(toDisplay(min, units), units)}
        max={roundDisplay(toDisplay(max, units), units)}
        step={stepFor(units)}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
