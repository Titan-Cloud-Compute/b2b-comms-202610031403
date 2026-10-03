/**
 * Story: invoice-generation — the PDF renderer emits a valid one-page PDF.
 */
import { formatCents, pdfEscape, renderInvoicePdf } from './invoice-pdf';

const data = {
  number: 'INV-000042',
  orderId: 'order-1',
  issuedAt: new Date('2026-10-03T12:00:00Z'),
  vendorName: 'Acme (Supplies)',
  customerName: 'Customer \\ Co',
  lines: [
    { description: 'Widget', quantity: 3, unitPriceCents: 500 },
    { description: 'Gadget', quantity: 1, unitPriceCents: 1200 },
  ],
  totalCents: 2700,
};

describe('invoice pdf renderer', () => {
  const pdf = renderInvoicePdf(data);
  const text = pdf.toString('latin1');

  it('produces a PDF document with header and EOF marker', () => {
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('is exactly one page', () => {
    expect(text).toContain('/Count 1');
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it('contains the invoice number, line items and total', () => {
    expect(text).toContain('Invoice INV-000042');
    expect(text).toContain('(Widget)');
    expect(text).toContain('$15.00');
    expect(text).toContain('Total: $27.00');
    expect(text).toContain('Acme \\(Supplies\\)');
  });

  it('has a correct xref table (offsets point at objects)', () => {
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const entries = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(5);
    entries.forEach((off, i) => expect(text.slice(off, off + 8)).toBe(`${i + 1} 0 obj\n`));
  });

  it('stream length matches content', () => {
    const m = /<< \/Length (\d+) >>\nstream\n/.exec(text)!;
    const start = m.index + m[0].length;
    expect(text.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
  });

  it('formats cents and escapes literals', () => {
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(123456)).toBe('$1234.56');
    expect(pdfEscape('a(b)\\cé')).toBe('a\\(b\\)\\\\c?');
  });
});
