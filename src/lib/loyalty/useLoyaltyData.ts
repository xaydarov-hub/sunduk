'use client';

import { useEffect, useState } from 'react';
import { DocumentData, Query, collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { AdDoc, BroadcastDoc, COL, LoyaltyTx, LoyaltyUser, MediaDoc } from '@/lib/loyalty/shared';

/** Admin panel uchun: kolleksiyani real vaqtda kuzatadi (qoidalar faqat adminga ruxsat beradi). */
function useLive<T>(build: () => Query<DocumentData> | null, deps: unknown[]): { items: T[]; loading: boolean; error: string } {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: string }>({ items: [], loading: true, error: '' });
  useEffect(() => {
    let q: Query<DocumentData> | null = null;
    try { q = build(); } catch { q = null; }
    if (!q) { setState({ items: [], loading: false, error: '' }); return; }
    setState(prev => ({ ...prev, loading: true }));
    return onSnapshot(
      q,
      snap => setState({ items: snap.docs.map(d => ({ ...(d.data() as object), id: d.id }) as T), loading: false, error: '' }),
      err => setState({ items: [], loading: false, error: (err as { code?: string }).code === 'permission-denied' ? 'Ruxsat yo‘q — qoidalar yangilanganmi? (firestore.rules)' : String(err.message || err) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const useLoyaltyUsers = (max = 2000) => useLive<LoyaltyUser>(() => query(collection(getDb(), COL.users), orderBy('createdAt', 'desc'), limit(max)), [max]);
export const useBroadcasts = () => useLive<BroadcastDoc>(() => query(collection(getDb(), COL.broadcasts), orderBy('createdAt', 'desc'), limit(30)), []);
export const useAds = () => useLive<AdDoc>(() => query(collection(getDb(), COL.ads), orderBy('order', 'asc')), []);
export const useMedia = () => useLive<MediaDoc>(() => query(collection(getDb(), COL.media), orderBy('createdAt', 'desc'), limit(40)), []);
export const useUserTx = (userId: string | null) =>
  useLive<LoyaltyTx>(() => (userId ? query(collection(getDb(), COL.tx), where('userId', '==', userId), limit(100)) : null), [userId]);
export const useRecentClaims = (sinceIso: string) =>
  useLive<{ id: string; amount: number; cashback?: number; claimedAt?: string; rating?: number; status: string }>(
    () => query(collection(getDb(), COL.claims), where('claimedAt', '>=', sinceIso), limit(2000)),
    [sinceIso],
  );
