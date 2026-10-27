/** RFC-4180 CSV with a BOM so Excel opens it as UTF-8. */
export interface CsvColumn<T> { header: string; value: (row: T) => string | number | null | undefined }

function cell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(v) : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
