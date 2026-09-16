'use client';

import { useEffect, useState } from 'react';

/** A numeric field that only commits valid, in-range values on blur or Enter. */
export function Numeric({
  label,
  value,
  min = 0,
  max = 600,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  function submit() {
    const next = Number(text);
    if (text.trim() && Number.isFinite(next) && next >= min && next <= max)
      onChange(next);
    else setText(String(value));
  }
  return (
    <label className="designer-numeric">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step="0.5"
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
