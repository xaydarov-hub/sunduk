'use client';

import { create } from 'zustand';

// Qurilmaga xos sozlamalar: chek printer faqat kassa kompyuterida ulangan, ofitsiant telefonida emas.
// Shuning uchun bular bazada emas, shu qurilmaning o'zida saqlanadi.
const KEY = 'sunduk-device';
const PRINTED_KEY = 'sunduk-printed-tickets';

export interface DevicePrefs {
  /** To'lovdan keyin chek oynasi o'zi ochilib, darhol chop etiladi. */
  autoPrintReceipt: boolean;
  /** Yangi buyurtma kelganda bar/oshxona talonchasi o'zi chop etiladi. */
  autoPrintTickets: boolean;
  /** Yangi buyurtmada ovozli signal. */
  sound: boolean;
}

const DEFAULTS: DevicePrefs = { autoPrintReceipt: false, autoPrintTickets: false, sound: true };

function load(): DevicePrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DevicePrefs>) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

interface DeviceState extends DevicePrefs {
  hydrated: boolean;
  hydrate: () => void;
  update: (patch: Partial<DevicePrefs>) => void;
}

export const useDevicePrefs = create<DeviceState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  hydrate: () => { if (!get().hydrated) set({ ...load(), hydrated: true }); },
  update: (patch) => {
    set(patch);
    try {
      const { autoPrintReceipt, autoPrintTickets, sound } = get();
      window.localStorage.setItem(KEY, JSON.stringify({ autoPrintReceipt, autoPrintTickets, sound }));
    } catch { /* maxfiy rejim */ }
  },
}));

/** Chop etilgan talonchalar (sahifa yangilanganda qayta chop etilmasligi uchun). */
export const printedTickets = {
  has(id: string): boolean {
    try { return (JSON.parse(window.localStorage.getItem(PRINTED_KEY) || '[]') as string[]).includes(id); } catch { return false; }
  },
  add(id: string): void {
    try {
      const list = JSON.parse(window.localStorage.getItem(PRINTED_KEY) || '[]') as string[];
      window.localStorage.setItem(PRINTED_KEY, JSON.stringify([...list.filter(x => x !== id), id].slice(-300)));
    } catch { /* maxfiy rejim */ }
  },
};
