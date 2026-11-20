// Jadvalni CSV (Excel ochadi) sifatida yuklab olish. UTF-8 BOM va ";" ajratgich — o'zbek/rus Excel'ida to'g'ri ochiladi.

const escapeCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(rows: Array<Array<unknown>>): string {
  return rows.map(row => row.map(escapeCell).join(';')).join('\r\n');
}

export function downloadCsv(filename: string, rows: Array<Array<unknown>>): void {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
