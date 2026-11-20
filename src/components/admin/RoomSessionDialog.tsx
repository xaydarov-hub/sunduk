'use client';

import { useRef, useState } from 'react';
import { Ban, Minus, Plus, Printer, Wallet, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { calculateCombinedBill, isOrderLocked } from '@/lib/calculations';
import { buildSessionReceipt, ReceiptData } from '@/lib/receipt';
import { formatCurrency, formatTime } from '@/lib/utils';
import { orderStatusLabel, orderStatusTone } from '@/lib/labels';
import { useNow, useT } from '@/lib/hooks';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { BillSummary } from '@/components/shared/BillSummary';
import { SessionClock } from '@/components/shared/SessionClock';
import { PaymentPanel } from '@/components/shared/PaymentPanel';
import { ReceiptModal } from '@/components/receipt/ReceiptModal';

type Pending =
  | { kind: 'order'; orderId: string; label: string }
  | { kind: 'item'; orderId: string; itemId: string; label: string }
  | { kind: 'session' }
  | null;

/** Admin: xona sessiyasini boshqarish — soatni o'zgartirish, buyurtma/pozitsiyani bekor qilish, hisob, to'lov, sessiyani bekor qilish. */
export function RoomSessionDialog({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const t = useT();
  const { sessions, orders, payments, settings, users, language, currentUser, setSessionHours, cancelOrder, voidOrderItem, cancelSession, logActivity, addToast } = useStore();
  const now = useNow(1000);
  const [pending, setPending] = useState<Pending>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const liveSession = sessions.find(s => s.id === sessionId);
  // To'lovdan keyin sessiya faol ro'yxatdan chiqib ketadi — oyna (va chek) yopilib ketmasligi uchun oxirgi holatini saqlaymiz
  const lastSession = useRef<typeof liveSession>(undefined);
  if (liveSession) lastSession.current = liveSession;
  const session = liveSession ?? (lastSession.current?.id === sessionId ? lastSession.current : undefined);
  if (!sessionId || !session) return <Modal open={false} onClose={onClose}>{null}</Modal>;

  const bill = calculateCombinedBill(session, orders, payments, settings, { at: now });
  const sessionOrders = orders.filter(o => o.sessionId === session.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hasPayments = payments.some(p => p.sessionId === session.id && p.status !== 'cancelled');
  const editable = session.status === 'active';

  const report = async (promise: Promise<{ ok: boolean; error?: string }>, success: string) => {
    const result = await promise;
    addToast(result.ok ? { type: 'success', title: success, message: '' } : { type: 'error', title: t('Amalga oshmadi', 'Не выполнено'), message: result.error || '' });
    return result;
  };

  const confirmPending = async (reason: string) => {
    if (!pending) return;
    if (pending.kind === 'order') await report(cancelOrder(pending.orderId, reason), t('Buyurtma bekor qilindi', 'Заказ отменён'));
    else if (pending.kind === 'item') await report(voidOrderItem(pending.orderId, pending.itemId, reason), t('Pozitsiya bekor qilindi', 'Позиция отменена'));
    else {
      const result = await report(cancelSession(session.id, reason), t('Sessiya bekor qilindi', 'Сессия отменена'));
      if (result.ok) onClose();
    }
  };

  const printBill = () => setReceipt(buildSessionReceipt({ kind: 'bill', session, orders, payments, settings, users, lang: language }));
  const logPrint = (data: ReceiptData) => {
    if (!currentUser) return;
    logActivity({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'bill_printed', details: `${session.roomNumber}: hisob (shot) chop etildi — ${formatCurrency(data.total)}`, entity: 'session', entityId: session.id });
  };

  const pendingTitle =
    pending?.kind === 'session' ? t('Xona sessiyasini bekor qilish', 'Отменить сессию комнаты')
      : pending?.kind === 'item' ? t('Pozitsiyani bekor qilish', 'Отменить позицию')
        : t('Buyurtmani bekor qilish', 'Отменить заказ');

  return (
    <>
      <Modal open onClose={onClose} size="xl" title={<span>{session.roomNumber} <span className="text-sm font-normal text-zinc-500">— {session.customerName || session.roomName} · {session.waiterName} · {formatTime(session.startTime)}</span></span>}>
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <div className="rounded-xl bg-black/25 p-4"><SessionClock session={session} size="md" /></div>

            {editable && (
              <div className="rounded-xl bg-black/25 p-4">
                <div className="mb-2 text-sm text-zinc-400">{t('Belgilangan vaqt (admin o‘zgartira oladi)', 'Заданное время (меняет админ)')}</div>
                <div className="flex items-center justify-between gap-3">
                  <button type="button" disabled={session.bookedHours <= 1} onClick={() => report(setSessionHours(session.id, session.bookedHours - 1), t('Vaqt o‘zgartirildi', 'Время изменено'))} className="btn-secondary h-11 w-11 p-0"><Minus className="mx-auto h-4 w-4" /></button>
                  <div className="text-2xl font-bold tabular-nums">{session.bookedHours} <span className="text-sm text-zinc-500">{t('soat', 'ч')}</span></div>
                  <button type="button" disabled={session.bookedHours >= 24} onClick={() => report(setSessionHours(session.id, session.bookedHours + 1), t('Vaqt o‘zgartirildi', 'Время изменено'))} className="btn-secondary h-11 w-11 p-0"><Plus className="mx-auto h-4 w-4" /></button>
                </div>
              </div>
            )}

            <div className="rounded-xl bg-black/25 p-4"><BillSummary bill={bill} showLines={false} /></div>

            <div className="grid gap-2">
              <button type="button" onClick={printBill} className="btn-secondary flex min-h-12 items-center justify-center gap-2"><Printer className="h-4 w-4" />{t('Hisobni chop etish (shot)', 'Распечатать счёт')}</button>
              {editable && <button type="button" onClick={() => setPayOpen(true)} className="btn-gold flex min-h-12 items-center justify-center gap-2"><Wallet className="h-4 w-4" />{t('To‘lov qabul qilish', 'Принять оплату')}</button>}
              {editable && (
                <button type="button" disabled={hasPayments} onClick={() => setPending({ kind: 'session' })} title={hasPayments ? t('To‘lov qabul qilingan', 'Оплата уже принята') : undefined} className="btn-danger flex min-h-12 items-center justify-center gap-2 disabled:opacity-40">
                  <Ban className="h-4 w-4" />{t('Sessiyani bekor qilish', 'Отменить сессию')}
                </button>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-3 font-semibold">{t('Buyurtmalar', 'Заказы')} ({sessionOrders.length})</h3>
            {sessionOrders.length === 0 && <p className="rounded-xl bg-black/25 p-6 text-center text-sm text-zinc-500">{t('Buyurtma yo‘q', 'Заказов нет')}</p>}
            <div className="space-y-3">
              {sessionOrders.map(order => {
                const locked = isOrderLocked(order, sessions, payments);
                return (
                  <div key={order.id} className={`rounded-xl bg-black/25 p-3 ${order.status === 'cancelled' ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{order.orderNumber} <span className="text-xs font-normal text-zinc-500">{formatTime(order.createdAt)} · {order.waiterName}</span></div>
                      <span className={`status-badge ${orderStatusTone[order.status]}`}>{orderStatusLabel(order.status, language)}</span>
                    </div>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {order.items.map(item => (
                        <li key={item.id} className="flex items-center justify-between gap-2">
                          <span className={item.voided || order.status === 'cancelled' ? 'text-zinc-500 line-through' : ''}>{item.quantity} × {language === 'uz' ? item.productName : item.productNameRu}</span>
                          <span className="flex items-center gap-2">
                            <span className={item.voided || order.status === 'cancelled' ? 'text-zinc-500 line-through' : 'text-zinc-300'}>{formatCurrency(item.totalPrice)}</span>
                            {!locked && !item.voided && (
                              <button type="button" aria-label={t('Pozitsiyani bekor qilish', 'Отменить позицию')} title={t('Pozitsiyani bekor qilish', 'Отменить позицию')} onClick={() => setPending({ kind: 'item', orderId: order.id, itemId: item.id, label: `${item.quantity} × ${item.productName}` })} className="rounded-md p-1 text-red-400 hover:bg-red-500/15"><X className="h-4 w-4" /></button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {order.cancelReason && <div className="mt-2 text-xs text-red-300">{t('Sabab', 'Причина')}: {order.cancelReason}</div>}
                    {!locked && (
                      <button type="button" onClick={() => setPending({ kind: 'order', orderId: order.id, label: order.orderNumber })} className="btn-danger mt-3 w-full !py-2 text-sm">{t('Butun buyurtmani bekor qilish', 'Отменить весь заказ')}</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirmPending}
        title={pendingTitle}
        message={pending && pending.kind !== 'session' ? <b>{pending.label}</b> : <span>{t('Barcha buyurtmalar bekor qilinadi, xona bo‘shatiladi.', 'Все заказы будут отменены, комната освободится.')}</span>}
        confirmLabel={t('Bekor qilish', 'Отменить')}
        danger
        withReason
      />

      <Modal open={payOpen} onClose={() => setPayOpen(false)} size="xl" title={`${t('To‘lov', 'Оплата')} — ${session.roomNumber}`}>
        <PaymentPanel fixedSessionId={session.id} onPaid={() => { setPayOpen(false); onClose(); }} />
      </Modal>

      <ReceiptModal data={receipt} onClose={() => setReceipt(null)} onPrint={logPrint} />
    </>
  );
}
