'use client';

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * HAQIQIY QR kod (skanerlanadi). Chek printeri uchun toza qora-oq SVG: kulrang yo'q, atrofida 4 modullik oq chekka bor.
 */
export function QrCode({ value, sizeMm }: { value: string; sizeMm: number }) {
  const { path, size } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row++) {
      let col = 0;
      while (col < count) {
        if (!qr.isDark(row, col)) { col += 1; continue; }
        let run = 1;
        while (col + run < count && qr.isDark(row, col + run)) run += 1;
        d += `M${col} ${row}h${run}v1h-${run}z`;
        col += run;
      }
    }
    return { path: d, size: count };
  }, [value]);
  const quiet = 4;
  const total = size + quiet * 2;
  return (
    <svg viewBox={`0 0 ${total} ${total}`} width={`${sizeMm}mm`} height={`${sizeMm}mm`} shapeRendering="crispEdges" role="img" aria-label="QR" style={{ display: 'block', margin: '0 auto' }}>
      <rect width={total} height={total} fill="#fff" />
      <path d={path} fill="#000" transform={`translate(${quiet} ${quiet})`} />
    </svg>
  );
}
