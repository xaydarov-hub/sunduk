'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadHistory, useStore } from '@/lib/store';
import { formatCurrency, formatDateTime, localDateKey } from '@/lib/utils';
import { paymentMethodLabel, PAYMENT_METHODS } from '@/lib/labels';
import { useT } from '@/lib/hooks';

type Range = 'today' | 'week' | 'all';

export default function BarHistoryPage() {
  const t = useT();
  const { payments, language } = useStore();
  const [range, setRange] = useState<Range>('today');

  useEffect(() => { void loadHistory(range === 'today' ? 1 : range === 'week' ? 7 : 90); }, [range]);

  const list = useMemo(() => {
    const today = localDateKey();
    const weekAgo = localDateKey(Date.now() - 6 * 24 * 3600 * 1000);
    return payments
      .filter(p => p.status !== 'cancelled')
      .filter(p => {
        const day = localDateKey(p.createdAt);
        return range === 'all' || (range === 'today' ? day === today : day >= weekAgo);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [payments, range]);

  const totals = PAYMENT_METHODS.map(method => ({ method, amount: list.filter(p => p.method === method).reduce((sum, p) => sum + p.amount, 0) }));
  const total = totals.reduce((sum, item) => sum + item.amount, 0);
  const ranges: Array<[Range, string]> = [['today', t('Bugun', 'Сегодня')], ['week', t('7 kun', '7 дней')], ['all', t('90 kun', '90 дней')]];

  return (
    <div className="page-container !p-3 sm:!p-6">
      <div className="section-header flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t('Savdo tarixi', 'История продаж')}</h1>
        <div className="flex rounded-xl bg-white/5 p-1">
          {ranges.map(([value, label]) => (
            <button key={value} onClick={() => setRange(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${range === value ? 'bg-gold-500 text-black' : 'text-zinc-400'}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="stat-card"><div className="text-xs text-zinc-500">{t('Jami', 'Всего')}</div><div className="mt-1 text-xl font-bold text-gold-400">{formatCurrency(total)}</div></div>
        {totals.map(item => <div key={item.method} className="stat-card"><div className="text-xs text-zinc-500">{paymentMethodLabel(item.method, language)}</div><div className="mt-1 text-xl font-bold">{formatCurrency(item.amount)}</div></div>)}
      </div>
      <div className="stat-card">
        {list.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">{t('Bu davrda savdo yo‘q', 'Продаж за период нет')}</p>}
        {list.map(p => {
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-white/5 py-3 last:border-0">
              <div>
                <div className="font-medium">{p.receiptNumber} <span className="text-xs font-normal text-zinc-500">· {p.roomNumber || t('Bar', 'Бар')}</span></div>
                <div className="text-xs text-zinc-500">{formatDateTime(p.createdAt)} · {paymentMethodLabel(p.method, language)}</div>
              </div>
              <div className="font-semibold text-gold-400">{formatCurrency(p.amount)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
