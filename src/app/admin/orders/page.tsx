'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, ChevronDown, ChevronUp, Lock, Search, X } from 'lucide-react';
import { ModulePage } from '@/components/shared/ModulePage';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { loadHistory, useStore } from '@/lib/store';
import { isOrderLocked } from '@/lib/calculations';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { orderStatusLabel, orderStatusTone } from '@/lib/labels';
import { useT } from '@/lib/hooks';

type Filter = 'all' | 'active' | 'served' | 'cancelled';

type Pending = { kind: 'order'; orderId: string; label: string } | { kind: 'item'; orderId: string; itemId: string; label: string } | null;

/** Admin: barcha buyurtmalar. Buyurtma yoki pozitsiyani bekor qilish FAQAT shu yerda (admin). */
export default function AdminOrdersPage() {
  const t = useT();
  const { orders, sessions, payments, language, cancelOrder, voidOrderItem, addToast } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [days, setDays] = useState(7);

  useEffect(() => { void loadHistory(days); }, [days]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter(o => filter === 'all' || (filter === 'active' ? ['new', 'accepted', 'preparing', 'ready'].includes(o.status) : o.status === filter))
      .filter(o => !q || `${o.orderNumber} ${o.roomNumber || 'bar'} ${o.waiterName || ''} ${o.barStaffName || ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, filter, query]);

  const filters: Array<[Filter, string]> = [['all', t('Hammasi', 'Все')], ['active', t('Faol', 'Активные')], ['served', t('Yetkazilgan', 'Выданные')], ['cancelled', t('Bekor qilingan', 'Отменённые')]];

  const confirm = async (reason: string) => {
    if (!pending) return;
    const result = await (pending.kind === 'order' ? cancelOrder(pending.orderId, reason) : voidOrderItem(pending.orderId, pending.itemId, reason));
    addToast(result.ok
      ? { type: 'warning', title: pending.kind === 'order' ? t('Buyurtma bekor qilindi', 'Заказ отменён') : t('Pozitsiya bekor qilindi', 'Позиция отменена'), message: pending.label }
      : { type: 'error', title: t('Amalga oshmadi', 'Не выполнено'), message: result.error });
  };

  return (
    <ModulePage title={t('Buyurtmalar', 'Заказы')} subtitle={t('Bekor qilish faqat adminda — sabab jurnalga yoziladi', 'Отмена только у админа — причина записывается в журнал')}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-white/5 p-1">
          {filters.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${filter === value ? 'bg-gold-500 text-black' : 'text-zinc-400'}`}>{label}</button>
          ))}
        </div>
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-3 h-5 w-5 text-zinc-500" />
          <input className="input-dark pl-10" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Raqam, xona yoki xodim', 'Номер, комната или сотрудник')} />
        </div>
      </div>

      <div className="space-y-3">
        {list.length === 0 && <div className="stat-card empty-state text-sm text-zinc-500">{t('Buyurtmalar topilmadi', 'Заказы не найдены')}</div>}
        {list.map(order => {
          const open = openId === order.id;
          const locked = isOrderLocked(order, sessions, payments);
          const who = order.source === 'room' ? order.waiterName : order.barStaffName;
          return (
            <article key={order.id} className="stat-card">
              <button type="button" onClick={() => setOpenId(open ? null : order.id)} className="flex w-full flex-wrap items-center justify-between gap-3 text-left">
                <div>
                  <div className="font-semibold">{order.orderNumber} <span className="ml-1 text-gold-400">{order.roomNumber || t('Bar savdosi', 'Продажа в баре')}</span></div>
                  <div className="text-xs text-zinc-500">{formatDateTime(order.createdAt)} · {who}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`status-badge ${orderStatusTone[order.status]}`}>{orderStatusLabel(order.status, language)}</span>
                  <b className={order.status === 'cancelled' ? 'text-zinc-500 line-through' : ''}>{formatCurrency(order.totalAmount)}</b>
                  {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                </div>
              </button>

              {open && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <ul className="space-y-2 text-sm">
                    {order.items.map(item => (
                      <li key={item.id} className="flex items-center justify-between gap-3">
                        <span className={item.voided || order.status === 'cancelled' ? 'text-zinc-500 line-through' : ''}>
                          {item.quantity} × {language === 'uz' ? item.productName : item.productNameRu}
                          {item.voided && <span className="ml-2 text-xs text-red-300 no-underline">({item.voidReason || t('bekor qilingan', 'отменено')})</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-zinc-300">{formatCurrency(item.totalPrice)}</span>
                          {!locked && !item.voided && (
                            <button type="button" title={t('Pozitsiyani bekor qilish', 'Отменить позицию')} aria-label={t('Pozitsiyani bekor qilish', 'Отменить позицию')} onClick={() => setPending({ kind: 'item', orderId: order.id, itemId: item.id, label: `${order.orderNumber}: ${item.quantity} × ${item.productName}` })} className="rounded-md p-1 text-red-400 hover:bg-red-500/15"><X className="h-4 w-4" /></button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {order.notes && <div className="mt-3 rounded-lg bg-yellow-500/10 p-2 text-xs text-yellow-300">{order.notes}</div>}
                  {order.status === 'cancelled' && (
                    <div className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
                      {t('Bekor qilindi', 'Отменён')}{order.cancelledAt ? ` · ${formatDateTime(order.cancelledAt)}` : ''}{order.cancelReason ? ` · ${order.cancelReason}` : ''}
                    </div>
                  )}
                  {order.status !== 'cancelled' && (
                    locked ? (
                      <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><Lock className="h-3.5 w-3.5" />{t('To‘langan hisobdagi buyurtmani o‘zgartirib bo‘lmaydi', 'Заказ из оплаченного счёта изменить нельзя')}</p>
                    ) : (
                      <button type="button" onClick={() => setPending({ kind: 'order', orderId: order.id, label: order.orderNumber })} className="btn-danger mt-4 flex items-center gap-2"><Ban className="h-4 w-4" />{t('Butun buyurtmani bekor qilish', 'Отменить весь заказ')}</button>
                    )
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {days < 90 && <button type="button" onClick={() => setDays(days === 7 ? 30 : 90)} className="btn-secondary mx-auto block">{t('Eski buyurtmalarni yuklash', 'Загрузить старые заказы')} ({days === 7 ? 30 : 90} {t('kun', 'дн.')})</button>}

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        title={pending?.kind === 'item' ? t('Pozitsiyani bekor qilish', 'Отменить позицию') : t('Buyurtmani bekor qilish', 'Отменить заказ')}
        message={pending ? <b>{pending.label}</b> : undefined}
        confirmLabel={t('Bekor qilish', 'Отменить')}
        danger
        withReason
      />
    </ModulePage>
  );
}
