'use client';

import { useMemo } from 'react';

/**
 * BEZAK QR — haqiqiy ma'lumot kodlamaydi va skanerlanmaydi (chek pastidagi dizayn elementi).
 * Shakli `seed` dan deterministik hosil bo'ladi: bir xil chek har doim bir xil ko'rinadi.
 */
const SIZE = 29; // QR 3-versiya o'lchami (29×29 modul)
const QUIET = 2;

function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGrid(seed: string): boolean[][] {
  const rand = mulberry32(hashSeed(seed));
  const grid: boolean[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => rand() > 0.5));

  const finder = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const gx = ox + x;
        const gy = oy + y;
        if (gx < 0 || gy < 0 || gx >= SIZE || gy >= SIZE) continue;
        const inside = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const ring = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        grid[gy][gx] = inside && (ring || core);
      }
    }
  };
  finder(0, 0);
  finder(SIZE - 7, 0);
  finder(0, SIZE - 7);

  // vaqt chiziqlari
  for (let i = 8; i < SIZE - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }
  // tekislash belgisi (5×5)
  for (let y = -2; y <= 2; y++) {
    for (let x = -2; x <= 2; x++) {
      const ring = Math.max(Math.abs(x), Math.abs(y));
      grid[22 + y][22 + x] = ring !== 1;
    }
  }
  return grid;
}

export function FakeQr({ seed, sizeMm = 30 }: { seed: string; sizeMm?: number }) {
  const rects = useMemo(() => {
    const grid = buildGrid(seed);
    const out: Array<{ x: number; y: number; w: number }> = [];
    for (let y = 0; y < SIZE; y++) {
      let x = 0;
      while (x < SIZE) {
        if (!grid[y][x]) { x++; continue; }
        let w = 1;
        while (x + w < SIZE && grid[y][x + w]) w++;
        out.push({ x: x + QUIET, y: y + QUIET, w });
        x += w;
      }
    }
    return out;
  }, [seed]);

  const total = SIZE + QUIET * 2;
  return (
    <svg
      role="img"
      aria-label="QR"
      viewBox={`0 0 ${total} ${total}`}
      style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm`, display: 'block' }}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#fff" />
      {rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill="#000" />)}
    </svg>
  );
}
