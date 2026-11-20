'use client';

import { useEffect } from 'react';
import { loadHistory, useStore } from '@/lib/store';
import { formatCurrency, formatDateTime, localDateKey } from '@/lib/utils';
import { orderStatusLabel, orderStatusTone } from '@/lib/labels';
import { useT } from '@/lib/hooks';

/** Ofitsiantning bugungi buyurtmalari tarixi (faqat ko'rish). */
export default function WaiterHistory() {
  const t = useT();
  const { orders, currentUser, language } = useStore();
  useEffect(() => { void loadHistory(7); }, []);
  const today = localDateKey();
  const mine = orders
    .filter(o => o.waiterId === currentUser?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const todayOrders = mine.filter(o => localDateKey(o.createdAt) === today && o.status !== 'cancelled');
  const todayTotal = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <div className="page-container !space-y-4 !p-3 sm:!p-6">
      <div className="section-header !mb-0 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t('Tarix', 'История')}</h1>
        <div className="flex gap-2 text-sm">
          <div className="stat-card !px-4 !py-2">{t('Bugun', 'Сегодня')}: <b>{todayOrders.length}</b> {t('ta', 'шт.')}</div>
          <div className="stat-card !px-4 !py-2">{t('Summa', 'Сумма')}: <b className="text-gold-400">{formatCurrency(todayTotal)}</b></div>
        </div>
      </div>
      <div className="stat-card">
        {mine.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">{t('Hali buyurtma yo‘q', 'Заказов пока нет')}</p>}
        {mine.map(order => (
          <div key={order.id} className="flex items-center justify-between gap-3 border-b border-white/5 py-3 last:border-0">
            <div className="min-w-0">
              <div className="font-medium">{order.orderNumber} · {order.roomNumber}</div>
              <div className="text-xs text-zinc-500">{formatDateTime(order.createdAt)}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`status-badge ${orderStatusTone[order.status]}`}>{orderStatusLabel(order.status, language)}</span>
              <div className={`font-semibold ${order.status === 'cancelled' ? 'text-zinc-500 line-through' : 'text-gold-400'}`}>{formatCurrency(order.totalAmount)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
