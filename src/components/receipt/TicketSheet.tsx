'use client';

import { Order } from '@/types';
import { formatDateTime, formatTime } from '@/lib/utils';

/**
 * Bar / oshxona buyurtma talonchasi: katta xona raqami, miqdor × nomi, izoh. Narx yo'q.
 * Faqat qora-oq, termo-printer uchun.
 */
export function TicketSheet({ order, paperWidthMm, business, lang, test }: {
  order: Order;
  paperWidthMm: number;
  business: string;
  lang: 'uz' | 'ru';
  test?: boolean;
}) {
  const items = order.items.filter(item => !item.voided);
  const t = lang === 'uz'
    ? { title: 'BUYURTMA', waiter: 'Ofitsiant', note: 'IZOH', test: 'SINOV' }
    : { title: 'ЗАКАЗ', waiter: 'Официант', note: 'КОММЕНТАРИЙ', test: 'ТЕСТ' };

  return (
    <div className={`receipt${paperWidthMm <= 58 ? ' receipt-narrow' : ''}`} style={{ width: `${paperWidthMm}mm` }}>
      <div className="r-center r-small r-bold">{business}</div>
      <div className="r-sep" />
      <div className="flex items-baseline justify-between" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="t-no">{t.title}{test ? ` (${t.test})` : ''}</span>
        <span className="t-no">{order.orderNumber}</span>
      </div>
      <div className="r-center t-room">{order.roomNumber || 'BAR'}</div>
      <div className="r-center r-small r-gap">
        {formatTime(order.createdAt)} · {formatDateTime(order.createdAt).slice(0, 10)}
        {order.waiterName ? ` · ${t.waiter}: ${order.waiterName}` : ''}
      </div>
      <div className="r-sep r-sep-solid" />
      {items.map(item => (
        <div key={item.id} className="t-line">
          <span className="t-qty">{item.quantity}×</span>
          <span>{lang === 'uz' ? item.productName : item.productNameRu}</span>
        </div>
      ))}
      {order.notes && <div className="t-note">{t.note}: {order.notes}</div>}
      <div className="r-sep" />
    </div>
  );
}
