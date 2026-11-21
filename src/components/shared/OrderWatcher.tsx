'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useDevicePrefs, printedTickets } from '@/lib/devicePrefs';
import { usePrintQueue } from '@/lib/printQueue';
import { chime } from '@/lib/sound';
import { nowMs } from '@/lib/clock';

/**
 * Kassa/bar qurilmasida yangi xona buyurtmasini kuzatadi: ovozli signal, ekran xabari va
 * (yoqilgan bo'lsa) talonchani o'zi chop etadi. Sahifa yangilanganda eski buyurtmalar qayta chiqmaydi.
 */
export function OrderWatcher() {
  const orders = useStore(state => state.orders);
  const syncReady = useStore(state => state.syncReady);
  const addToast = useStore(state => state.addToast);
  const language = useStore(state => state.language);
  const prefs = useDevicePrefs();
  const enqueue = usePrintQueue(state => state.enqueue);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => { prefs.hydrate(); }, [prefs]);

  useEffect(() => {
    if (!syncReady || !prefs.hydrated) return;
    if (seen.current === null) { seen.current = new Set(orders.map(o => o.id)); return; } // boshlang'ich holat: mavjud buyurtmalar tegilmaydi
    const known = seen.current;
    const fresh = orders.filter(o => !known.has(o.id));
    if (!fresh.length) return;
    fresh.forEach(o => known.add(o.id));

    const incoming = fresh
      .filter(o => o.source === 'room' && o.status === 'new' && nowMs() - new Date(o.createdAt).getTime() < 10 * 60 * 1000)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!incoming.length) return;

    if (prefs.sound) chime();
    incoming.forEach(order => {
      addToast({
        type: 'info',
        title: `${language === 'uz' ? 'Yangi buyurtma' : 'Новый заказ'}: ${order.roomNumber || 'Bar'}`,
        message: order.items.filter(i => !i.voided).map(i => `${i.quantity}× ${language === 'uz' ? i.productName : i.productNameRu}`).join(', '),
        duration: 8000,
      });
      if (prefs.autoPrintTickets && !printedTickets.has(order.id)) {
        printedTickets.add(order.id);
        enqueue({ kind: 'ticket', order });
      }
    });
  }, [orders, syncReady, prefs.hydrated, prefs.sound, prefs.autoPrintTickets, addToast, enqueue, language]);

  return null;
}
