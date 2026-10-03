/**
 * Story: invoice-generation — dependency-free, one-page invoice PDF renderer.
 * Emits a minimal valid PDF 1.4 (Helvetica, single page, correct xref table).
 */

export interface InvoicePdfLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface InvoicePdfData {
  number: string;
  orderId: string;
  issuedAt: Date;
  vendorName: string;
  customerName: string;
  lines: InvoicePdfLine[];
  totalCents: number;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Escape a string for a PDF literal; non-ASCII is replaced with '?'. */
export function pdfEscape(text: string): string {
  return text
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function contentStream(data: InvoicePdfData): string {
  const ops: string[] = ['BT'];
  let y = 760;
  const text = (s: string, size = 11, x = 50) => {
    ops.push(`/F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(s)}) Tj`);
  };
  text(`Invoice ${data.number}`, 20);
  y -= 30;
  text(`Order: ${data.orderId}`);
  y -= 16;
  text(`Issued: ${data.issuedAt.toISOString().slice(0, 10)}`);
  y -= 16;
  text(`Vendor: ${data.vendorName}`);
  y -= 16;
  text(`Customer: ${data.customerName}`);
  y -= 30;
  text('Item', 11, 50);
  text('Qty', 11, 330);
  text('Unit', 11, 390);
  text('Amount', 11, 470);
  y -= 18;
  // Keep to one page: at most 30 lines, then a summary row.
  const shown = data.lines.slice(0, 30);
  for (const l of shown) {
    text(l.description.slice(0, 45), 10, 50);
    text(String(l.quantity), 10, 330);
    text(formatCents(l.unitPriceCents), 10, 390);
    text(formatCents(l.unitPriceCents * l.quantity), 10, 470);
    y -= 15;
  }
  if (data.lines.length > shown.length) {
    text(`... and ${data.lines.length - shown.length} more item(s)`, 10, 50);
    y -= 15;
  }
  y -= 15;
  text(`Total: ${formatCents(data.totalCents)}`, 13, 390);
  ops.push('ET');
  return ops.join('\n');
}

export function renderInvoicePdf(data: InvoicePdfData): Buffer {
  const stream = contentStream(data);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
