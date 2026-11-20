'use client';

import Link from 'next/link';
import { PackageCheck } from 'lucide-react';
import { useStore } from '@/lib/store';
import { formatCurrency, formatTime, getTimeAgo } from '@/lib/utils';
import { orderStatusLabel, orderStatusTone } from '@/lib/labels';
import { useNow, useT } from '@/lib/hooks';
import { OrderStatus } from '@/types';

const rank: Record<OrderStatus, number> = { ready: 0, preparing: 1, accepted: 2, new: 3, served: 4, cancelled: 5 };

/** Ochiq xonalardagi buyurtmalar holati. Tayyor bo'lganlari birinchi — ofitsiant yetkazadi. Bekor qilish yo'q. */
export default function WaiterOrdersPage() {
  const t = useT();
  const { orders, sessions, language, updateOrderStatus, addToast } = useStore();
  useNow(30000); // "n daqiqa oldin" yangilanib turishi uchun

  const activeSessionIds = new Set(sessions.filter(s => s.status === 'active').map(s => s.id));
  const list = orders
    .filter(o => o.source === 'room' && o.sessionId && activeSessionIds.has(o.sessionId) && o.status !== 'cancelled')
    .sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt));
  const ready = list.filter(o => o.status === 'ready').length;

  const serve = async (orderId: string) => {
    if (await updateOrderStatus(orderId, 'served')) addToast({ type: 'success', title: t('Yetkazildi deb belgilandi', 'Отмечено как выдано'), message: '' });
  };

  return (
    <div className="page-container !space-y-4 !p-3 sm:!p-6">
      <div>
        <h1 className="text-2xl font-bold">{t('Buyurtmalar', 'Заказы')}</h1>
        <p className="mt-1 text-sm text-zinc-500">{ready > 0 ? `${ready} ${t('ta buyurtma tayyor — xonaga olib boring', 'заказ(ов) готово — несите в комнату')}` : t('Ochiq xonalardagi buyurtmalar', 'Заказы в открытых комнатах')}</p>
      </div>

      {list.length === 0 && <div className="stat-card empty-state text-sm text-zinc-500">{t('Hozircha buyurtma yo‘q', 'Заказов пока нет')}</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map(order => (
          <article key={order.id} className={`stat-card ${order.status === 'ready' ? '!border-green-500/60 bg-green-500/5' : ''} ${order.status === 'served' ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/waiter/room/?id=${order.roomId}`} className="text-xl font-bold text-gold-400 hover:underline">{order.roomNumber}</Link>
                <div className="text-xs text-zinc-500">{order.orderNumber} · {formatTime(order.createdAt)} · {getTimeAgo(order.createdAt, language)}</div>
              </div>
              <span className={`status-badge ${orderStatusTone[order.status]}`}>{orderStatusLabel(order.status, language)}</span>
            </div>
            <ul className="my-3 space-y-1 text-sm">
              {order.items.filter(i => !i.voided).map(item => (
                <li key={item.id} className="flex justify-between gap-3"><span>{item.quantity} × {language === 'uz' ? item.productName : item.productNameRu}</span><span className="shrink-0 text-zinc-400">{formatCurrency(item.totalPrice)}</span></li>
              ))}
            </ul>
            {order.notes && <div className="mb-3 rounded-lg bg-yellow-500/10 p-2 text-xs text-yellow-300">{order.notes}</div>}
            {order.status === 'ready' && (
              <button type="button" onClick={() => serve(order.id)} className="btn-gold flex min-h-12 w-full items-center justify-center gap-2"><PackageCheck className="h-5 w-5" />{t('YETKAZILDI', 'ВЫДАНО')}</button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
