'use client';
import { useState } from 'react';
import type { Design } from '@/designer/model';
import type { PriceBook } from '@/designer/supplier-pricing';
import { supplierQuoteHtml, type QuoteBrand } from '@/designer/quote-print';
export function QuoteDocument({
  design,
  book,
  revision,
  onChange,
}: {
  design: Design;
  book: PriceBook;
  revision: number;
  onChange: (d: Design) => void;
}) {
  const [message, setMessage] = useState('');
  const brand: QuoteBrand = design.quoteDocument ?? {
    company: '',
    contact: '',
    number: '',
    terms: '',
    validUntil: '',
  };
  const update = (patch: Partial<QuoteBrand>) =>
    onChange({ ...design, quoteDocument: { ...brand, ...patch } });
  return (
    <details className="quote-document">
      <summary>Branded quote / PDF</summary>
      <p>
        Add your company details and terms. These save with the design. The PDF
        uses the selected supplier’s current prices.
      </p>
      <div className="business-grid">
        {(['company', 'contact', 'number', 'validUntil'] as const).map(
          (field) => (
            <label key={field}>
              {
                {
                  company: 'Company name',
                  contact: 'Contact details',
                  number: 'Quote number',
                  validUntil: 'Quote expiry',
                }[field]
              }
              <input
                aria-label={`Quote ${field}`}
                type={field === 'validUntil' ? 'date' : 'text'}
                value={brand[field]}
                maxLength={
                  field === 'contact' ? 500 : field === 'number' ? 80 : 160
                }
                max={field === 'validUntil' ? book.validUntil : undefined}
                onChange={(e) => update({ [field]: e.target.value })}
              />
            </label>
          ),
        )}
      </div>
      <label>
        Client name
        <input
          aria-label="Quote client name"
          maxLength={200}
          value={design.quote?.customer ?? ''}
          onChange={(e) =>
            onChange({
              ...design,
              quote: {
                tax: 0,
                discount: 0,
                installation: 0,
                delivery: 0,
                ...design.quote,
                customer: e.target.value,
              },
            })
          }
        />
      </label>
      <label>
        Terms & notes
        <textarea
          aria-label="Quote terms"
          maxLength={4000}
          value={brand.terms}
          onChange={(e) => update({ terms: e.target.value })}
        />
      </label>
      <label>
        Company logo
        <input
          aria-label="Quote logo"
          type="file"
          accept="image/png,image/jpeg"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              if (
                !['image/png', 'image/jpeg'].includes(file.type) ||
                file.size > 2000000
              )
                throw Error('Choose a PNG or JPEG logo under 2 MB.');
              const bitmap = await createImageBitmap(file);
              const scale = Math.min(1, 200 / bitmap.width, 90 / bitmap.height);
              const canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round(bitmap.width * scale));
              canvas.height = Math.max(1, Math.round(bitmap.height * scale));
              const ctx = canvas.getContext('2d');
              if (!ctx) throw Error('Logo preview unavailable.');
              ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              bitmap.close();
              const logo = canvas.toDataURL('image/png');
              if (logo.length > 45000)
                throw Error('Logo is too complex. Choose a simpler logo.');
              update({ logo });
              setMessage('Logo saved with this design.');
            } catch (error) {
              setMessage((error as Error).message);
            }
          }}
        />
      </label>
      {brand.logo && (
        <>
          <img
            src={brand.logo}
            alt="Quote logo preview"
            style={{ maxWidth: 200, maxHeight: 90 }}
          />
          <button
            onClick={() => {
              const { logo: _logo, ...rest } = brand;
              void _logo;
              onChange({ ...design, quoteDocument: rest });
            }}
          >
            Remove quote logo
          </button>
        </>
      )}
      <button
        onClick={() => {
          try {
            const html = supplierQuoteHtml(design, book, brand, revision);
            const popup = window.open('', '_blank');
            if (!popup)
              throw Error('Allow pop-ups to open the printable quote.');
            popup.opener = null;
            popup.document.write(html);
            popup.document.close();
            setMessage('Quote opened. Choose Print / save PDF.');
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      >
        Open quote PDF
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
