'use client';

import { getFirebaseAuth } from '@/lib/firebase';

// Netlify Functions bilan xavfsiz aloqa: har so'rovga xodimning Firebase ID tokeni qo'shiladi, server rolni bazadan tekshiradi.
const BASE = process.env.NEXT_PUBLIC_FUNCTIONS_BASE || '/.netlify/functions';

export type ApiResult<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

async function token(): Promise<string | null> {
  try { return (await getFirebaseAuth().currentUser?.getIdToken()) ?? null; } catch { return null; }
}

export async function loyaltyCall<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  const idToken = await token();
  if (!idToken) return { ok: false, error: 'Tizimga qayta kiring' };
  try {
    const res = await fetch(`${BASE}/loyalty-api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action, ...body }),
    });
    const data = (await res.json().catch(() => null)) as ApiResult<T> | null;
    if (data) return data;
    return { ok: false, error: res.status === 404 ? 'Server funksiyasi topilmadi (faqat jonli saytda ishlaydi)' : `Server xatosi (${res.status})` };
  } catch {
    return { ok: false, error: 'Server bilan aloqa yo‘q — internetni tekshiring' };
  }
}

/** Ommaviy xabarni fon funksiyasida yuborishni boshlaydi (202 qaytadi, jarayon admin panelda real vaqtda ko'rinadi). */
export async function startBroadcast(id: string): Promise<{ ok: boolean; error?: string }> {
  const idToken = await token();
  if (!idToken) return { ok: false, error: 'Tizimga qayta kiring' };
  try {
    const res = await fetch(`${BASE}/tg-broadcast-background`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ id }),
    });
    if (res.status === 202 || res.ok) return { ok: true };
    return { ok: false, error: res.status === 403 ? 'Ruxsat yo‘q' : `Server xatosi (${res.status})` };
  } catch {
    return { ok: false, error: 'Server bilan aloqa yo‘q — internetni tekshiring' };
  }
}

// ---- kassa uchun qisqa yordamchilar
export interface RedeemInfo { code: string; userId: string; name: string; phone?: string; tier: string; balance: number; max: number; expiresAt: string }

export const lookupCashback = (code: string, due: number) => loyaltyCall<{ info: RedeemInfo }>('lookup', { code, due });
export const redeemCashback = (p: { code: string; amount: number; due: number }) => loyaltyCall<{ id: string; balance: number; name: string }>('redeem', p);
export const refundCashback = (id: string) => loyaltyCall('refund', { id });
export const confirmCashback = (id: string, receiptNumber: string) => loyaltyCall('confirm', { id, receiptNumber });
