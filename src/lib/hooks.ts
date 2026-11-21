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

/** Ekran o'chib qolmasligi uchun (kassa kompyuteri/planshet). Qo'llab-quvvatlanmasa — hech narsa qilmaydi. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try { lock = await navigator.wakeLock.request('screen'); } catch { /* ruxsat yo'q yoki batareya tejash rejimi */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void request(); };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => { /* allaqachon bo'shatilgan */ });
    };
  }, [enabled]);
}
