'use client';

import { create } from 'zustand';
import { Order } from '@/types';

/** Dialogsiz navbat bilan chop etiladigan ishlar (hozircha: bar/oshxona talonchasi). */
export interface TicketJob {
  id: string;
  kind: 'ticket';
  order: Order;
  /** "Sinov" talonchasi uchun */
  test?: boolean;
}

interface QueueState {
  current: TicketJob | null;
  queue: TicketJob[];
  enqueue: (job: Omit<TicketJob, 'id'>) => void;
  finish: () => void;
}

let counter = 0;
let gap = false; // ikki ish orasidagi qisqa pauza (printer ulgurishi uchun)

export const usePrintQueue = create<QueueState>((set, get) => ({
  current: null,
  queue: [],
  enqueue: (job) => {
    const item: TicketJob = { ...job, id: `job-${Date.now()}-${counter++}` };
    if (!get().current && !gap) set({ current: item });
    else set(state => ({ queue: [...state.queue, item] }));
  },
  finish: () => {
    set({ current: null });
    gap = true;
    setTimeout(() => {
      gap = false;
      const [next, ...rest] = get().queue;
      if (!get().current && next) set({ current: next, queue: rest });
    }, 600);
  },
}));
