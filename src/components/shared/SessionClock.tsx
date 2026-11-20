'use client';

import { Clock } from 'lucide-react';
import { calculateRoomCharge } from '@/lib/calculations';
import { formatClock } from '@/lib/utils';
import { useNow, useT } from '@/lib/hooks';
import { useStore } from '@/lib/store';
import { RoomSession } from '@/types';

export type ClockTone = 'green' | 'amber' | 'red';

const toneText: Record<ClockTone, string> = { green: 'text-green-400', amber: 'text-amber-400', red: 'text-red-400' };
const toneBar: Record<ClockTone, string> = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' };

export function clockTone(remainingSeconds: number): ClockTone {
  if (remainingSeconds < 0) return 'red';
  if (remainingSeconds <= 600) return 'amber';
  return 'green';
}

/** Xona sessiyasi uchun jonli teskari sanoq (qolgan vaqt yoki oshib ketgan vaqt) va progress. */
export function SessionClock({ session, size = 'md' }: { session: RoomSession; size?: 'sm' | 'md' | 'lg' }) {
  const t = useT();
  const billing = useStore(state => state.settings);
  const now = useNow(1000);
  const charge = calculateRoomCharge(session, billing, now);
  const tone = clockTone(charge.remainingSeconds);
  const big = size === 'lg' ? 'text-5xl' : size === 'md' ? 'text-3xl' : 'text-2xl';

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{charge.isOvertime ? t('Vaqt tugadi', 'Время вышло') : t('Qolgan vaqt', 'Осталось')}</span>
        <span>{charge.bookedHours} {t('soat', 'ч')}</span>
      </div>
      <div className={`mt-1 font-mono font-bold tabular-nums ${big} ${toneText[tone]}`}>
        {charge.isOvertime ? '+' : ''}{formatClock(charge.isOvertime ? charge.overtimeSeconds : charge.remainingSeconds)}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-all ${toneBar[tone]}`} style={{ width: `${Math.round(charge.progress * 100)}%` }} />
      </div>
    </div>
  );
}
