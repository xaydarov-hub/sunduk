'use client';

import { useStore } from '@/lib/store';
import { formatCurrency, formatTime } from '@/lib/utils';
import { orderStatusLabel, orderStatusTone } from '@/lib/labels';
import { useNow, useT } from '@/lib/hooks';
import { OrderStatus } from '@/types';

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = { new: 'accepted', accepted: 'preparing', preparing: 'ready' };

/**
 * Bar navbati: yangi → qabul → tayyorlanmoqda → tayyor.
 * Bu yerda bekor qilish yo'q: buyurtmani faqat admin bekor qila oladi.
 */
export default function BarOrdersPage() {
  const t = useT();
  const { orders, updateOrderStatus, language, addToast } = useStore();
  const now = useNow(30000);

  const queue = orders
    .filter(o => o.source === 'room' && ['new', 'accepted', 'preparing', 'ready'].includes(o.status))
    .sort((a, b) => (a.status === 'ready' ? 1 : 0) - (b.status === 'ready' ? 1 : 0) || a.createdAt.localeCompare(b.createdAt));
  const waiting = queue.filter(o => o.status !== 'ready').length;

  const move = async (orderId: string, status: OrderStatus) => {
    if (await updateOrderStatus(orderId, status)) addToast({ title: t('Holat yangilandi', 'Статус обновлён'), message: orderStatusLabel(status, language), type: 'success' });
  };

  const actionLabel = (status: OrderStatus) =>
    status === 'new' ? t('QABUL QILISH', 'ПРИНЯТЬ') : status === 'accepted' ? t('TAYYORLASH', 'НАЧАТЬ ГОТОВИТЬ') : t('TAYYOR', 'ГОТОВО');

  return (
    <div className="page-container !p-3 sm:!p-6">
      <div className="section-header">
        <div>
          <h1 className="text-2xl font-bold">{t('Buyurtmalar', 'Заказы')}</h1>
          <p className="text-sm text-zinc-500">{waiting} {t('ta buyurtma kutmoqda', 'заказ(ов) в очереди')}</p>
        </div>
      </div>
      {queue.length === 0 && (
        <div className="stat-card empty-state">
          <b>{t('Yangi buyurtma yo‘q', 'Новых заказов нет')}</b>
          <p className="text-sm text-zinc-500">{t('Ofitsiant xonaga buyurtma qo‘shganda bu yerda ko‘rinadi.', 'Заказы официанта появятся здесь.')}</p>
        </div>
      )}
      <div className="mt-2 grid gap-4 xl:grid-cols-2">
        {queue.map(order => {
          const next = nextStatus[order.status];
          const minutes = Math.floor((now - new Date(order.createdAt).getTime()) / 60000);
          const late = order.status !== 'ready' && minutes >= 10;
          return (
            <article key={order.id} className={`stat-card ${late ? '!border-red-500/50' : ''} ${order.status === 'ready' ? 'opacity-70' : ''}`}>
              <div className="flex justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold text-gold-400">{order.roomNumber || 'Bar'}</div>
                  <div className="font-semibold">{order.orderNumber}</div>
                  <div className="text-xs text-zinc-500">{formatTime(order.createdAt)} · <span className={late ? 'font-semibold text-red-400' : ''}>{Math.max(0, minutes)} {t('daq', 'мин')}</span> · {order.waiterName}</div>
                </div>
                <span className={`status-badge h-fit ${orderStatusTone[order.status]}`}>{orderStatusLabel(order.status, language)}</span>
              </div>
              <div className="my-4 space-y-2">
                {order.items.filter(i => !i.voided).map(item => (
                  <div key={item.id} className="flex justify-between text-sm"><span className="font-medium">{item.quantity} × {language === 'uz' ? item.productName : item.productNameRu}</span><span className="text-zinc-400">{formatCurrency(item.totalPrice)}</span></div>
                ))}
              </div>
              {order.notes && <div className="mb-3 rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-300">{order.notes}</div>}
              {next ? (
                <button onClick={() => move(order.id, next)} className="btn-gold min-h-14 w-full text-base">{actionLabel(order.status)}</button>
              ) : (
                <div className="rounded-lg bg-green-500/10 p-3 text-center text-sm text-green-300">{t('Tayyor — ofitsiant olib borishini kutmoqda', 'Готово — ждёт официанта')}</div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
