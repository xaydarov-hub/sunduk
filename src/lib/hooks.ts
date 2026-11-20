'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { nowMs } from '@/lib/clock';

/** Brauzerda mount bo'lgandan keyin true. SSR va hydration nomuvofiqligini oldini oladi. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Har `intervalMs` da yangilanadigan hozirgi vaqt (taymerlar uchun). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => nowMs());
  useEffect(() => {
    setNow(nowMs());
    const timer = window.setInterval(() => setNow(nowMs()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** t('Uzbekcha', 'Русский') — tanlangan tilga qarab matn qaytaradi. */
export function useT() {
  const language = useStore(state => state.language);
  return useCallback((uz: string, ru: string) => (language === 'uz' ? uz : ru), [language]);
}
