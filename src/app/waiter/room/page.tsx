'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, BellRing, Check, Clock, Minus, PackageCheck, Plus, Printer, Search, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import { useStore } from '@/lib/store';
import { calculateCombinedBill } from '@/lib/calculations';
import { buildSessionReceipt, ReceiptData } from '@/lib/receipt';
import { formatCurrency, formatTime, isLowStock, isSellable, isStockTracked } from '@/lib/utils';
import { orderStatusLabel, orderStatusTone } from '@/lib/labels';
import { useNow, useT } from '@/lib/hooks';
import { SessionClock } from '@/components/shared/SessionClock';
import { BillSummary } from '@/components/shared/BillSummary';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Price } from '@/components/ui/Price';
import { ReceiptModal } from '@/components/receipt/ReceiptModal';

/**
 * Ofitsiant ish joyi: bitta xona. Menyudan taom qo'shadi, hisobni ko'radi va chop etadi.
 * DIQQAT: bu yerda buyurtmani yoki pozitsiyani bekor qilish funksiyasi yo'q — faqat admin bekor qila oladi.
 * Qoralama (hali xonaga qo'shilmagan) savat esa tasdiqlashdan oldin erkin tahrirlanadi.
 */
export default function WaiterRoomPage() {
  return <Suspense fallback={null}><WaiterRoomContent /></Suspense>;
}

function WaiterRoomContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const t = useT();
  const {
    rooms, sessions, orders, payments, products, categories, settings, users, language, currentUser,
    createOrder, updateOrderStatus, extendSession, requestPayment, logActivity, addToast,
  } = useStore();
  const now = useNow(1000);

  const room = rooms.find(r => r.id === id);
  const session = sessions.find(s => s.roomId === id && s.status === 'active');

  const [tab, setTab] = useState<'menu' | 'bill'>('menu');
  const [categoryId, setCategoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [extendOpen, setExtendOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [requested, setRequested] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [committing, setCommitting] = useState(false);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter(p => p.isActive && (categoryId === 'all' || p.categoryId === categoryId))
      .filter(p => !q || `${p.name} ${p.nameRu}`.toLowerCase().includes(q));
  }, [products, categoryId, search]);

  const activeCategories = useMemo(
    () => categories.filter(c => c.isActive !== false).sort((a, b) => (a.order || 0) - (b.order || 0)),
    [categories],
  );

  if (!room) {
    return <div className="page-container"><div className="stat-card empty-state text-zinc-400">{t('Xona topilmadi', 'Комната не найдена')}<Link href="/waiter" className="btn-gold mt-4">{t('Xonalarga qaytish', 'К комнатам')}</Link></div></div>;
  }
  if (!session) {
    return (
      <div className="page-container">
        <div className="stat-card empty-state">
          <div className="text-xl font-bold">{room.number}</div>
          <p className="mt-2 text-sm text-zinc-400">{t('Bu xona hozir ochiq emas (yopilgan yoki to‘langan).', 'Эта комната сейчас не открыта (закрыта или оплачена).')}</p>
          <Link href="/waiter" className="btn-gold mt-5">{t('Xonalarga qaytish', 'К комнатам')}</Link>
        </div>
      </div>
    );
  }

  const bill = calculateCombinedBill(session, orders, payments, settings, { at: now });
  const sessionOrders = orders.filter(o => o.sessionId === session.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const draftItems = products.filter(p => (draft[p.id] || 0) > 0).map(p => ({ product: p, quantity: draft[p.id] }));
  const draftCount = draftItems.reduce((sum, item) => sum + item.quantity, 0);
  const draftTotal = draftItems.reduce((sum, item) => sum + item.quantity * item.product.salePrice, 0);

  const nameOf = (p: { name: string; nameRu: string }) => (language === 'uz' ? p.name : p.nameRu);
  const canAddMore = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product || !isSellable(product)) return false;
    return !isStockTracked(product) || (draft[productId] || 0) < product.currentStock;
  };
  const change = (productId: string, delta: number) => {
    if (delta > 0 && !canAddMore(productId)) {
      addToast({ type: 'warning', title: t('Qoldiq yetarli emas', 'Недостаточно на складе'), message: '' });
      return;
    }
    setDraft(current => {
      const next = Math.max(0, Math.min(99, (current[productId] || 0) + delta));
      const copy = { ...current };
      if (next === 0) delete copy[productId]; else copy[productId] = next;
      return copy;
    });
  };

  const commit = async () => {
    if (!draftItems.length || committing) return;
    setCommitting(true);
    const result = await createOrder({ sessionId: session.id, items: draftItems.map(i => ({ productId: i.product.id, quantity: i.quantity })), notes: note });
    setCommitting(false);
    if (!result.ok) { addToast({ type: 'error', title: t('Qo‘shilmadi', 'Не добавлено'), message: result.error }); return; }
    addToast({ type: 'success', title: t('Xonaga qo‘shildi, barga yuborildi', 'Добавлено в комнату и отправлено в бар'), message: `${result.order.orderNumber} · ${formatCurrency(result.order.totalAmount)}` });
    setDraft({});
    setNote('');
    setCartOpen(false);
  };

  const printBill = () => setReceipt(buildSessionReceipt({ kind: 'bill', session, orders, payments, settings, users, lang: language }));
  const logPrint = (data: ReceiptData) => {
    if (!currentUser) return;
    logActivity({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'bill_printed', details: `${session.roomNumber}: hisob (shot) chop etildi — ${formatCurrency(data.total)}`, entity: 'session', entityId: session.id });
  };

  const sendRequest = () => {
    requestPayment(session.id);
    setRequested(true);
    addToast({ type: 'success', title: t('Kassaga so‘rov yuborildi', 'Запрос отправлен на кассу'), message: session.roomNumber });
    window.setTimeout(() => setRequested(false), 60000);
  };

  const doExtend = async () => {
    const result = await extendSession(session.id, 1);
    if (!result.ok) addToast({ type: 'error', title: t('Uzaytirilmadi', 'Не продлено'), message: result.error });
    else addToast({ type: 'success', title: t('+1 soat qo‘shildi', '+1 час добавлен'), message: '' });
  };

  const serve = async (orderId: string) => {
    if (await updateOrderStatus(orderId, 'served')) addToast({ type: 'success', title: t('Yetkazildi deb belgilandi', 'Отмечено как выдано'), message: '' });
  };

  const warning = bill.isOvertime
    ? { tone: 'border-red-500/40 bg-red-500/10 text-red-200', text: bill.overtimeHours > 0 ? t(`Vaqt tugadi. Qo‘shimcha ${bill.overtimeHours} soat hisoblanmoqda — uzaytiring yoki hisobni chiqaring.`, `Время вышло. Начисляется доп. ${bill.overtimeHours} ч — продлите или распечатайте счёт.`) : t('Vaqt tugadi. Uzaytiring yoki hisobni chiqaring.', 'Время вышло. Продлите или распечатайте счёт.') }
    : bill.remainingSeconds <= 600
      ? { tone: 'border-amber-500/40 bg-amber-500/10 text-amber-200', text: t(`Vaqt tugashiga ${Math.ceil(bill.remainingSeconds / 60)} daqiqa qoldi.`, `До конца времени ${Math.ceil(bill.remainingSeconds / 60)} мин.`) }
      : null;

  return (
    <div className="page-container !space-y-4 !p-3 sm:!p-6">
      {/* Sarlavha */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/waiter" className="btn-secondary flex h-11 w-11 items-center justify-center p-0" aria-label={t('Orqaga', 'Назад')}><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold">{room.number} <span className="text-base font-normal text-zinc-500">{room.name}</span></h1>
            <p className="text-sm text-zinc-500">{session.customerName ? `${session.customerName} · ` : ''}{t('Boshlandi', 'Начало')} {formatTime(session.startTime)} · {session.waiterName}</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 rounded-xl bg-white/5 p-1 lg:hidden">
          <button type="button" onClick={() => setTab('menu')} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${tab === 'menu' ? 'bg-gold-500 text-black' : 'text-zinc-400'}`}><UtensilsCrossed className="h-4 w-4" />{t('Menyu', 'Меню')}</button>
          <button type="button" onClick={() => setTab('bill')} className={`relative flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${tab === 'bill' ? 'bg-gold-500 text-black' : 'text-zinc-400'}`}>
            <ShoppingCart className="h-4 w-4" />{t('Xona hisobi', 'Счёт комнаты')}
            {draftCount > 0 && <span className="absolute right-2 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{draftCount}</span>}
          </button>
        </div>
      </div>

      {warning && <div className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${warning.tone}`}><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><span>{warning.text}</span></div>}

      <div className="lg:flex lg:items-start lg:gap-5">
        {/* Menyu */}
        <section className={`min-w-0 flex-1 ${tab === 'menu' ? '' : 'hidden lg:block'}`}>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-3 h-5 w-5 text-zinc-500" />
            <input className="input-dark !py-3 pl-10" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('Menyudan qidirish', 'Поиск в меню')} />
          </div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setCategoryId('all')} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold ${categoryId === 'all' ? 'bg-gold-500 text-black' : 'bg-white/5 text-zinc-300'}`}>{t('Hammasi', 'Все')}</button>
            {activeCategories.map(category => (
              <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold ${categoryId === category.id ? 'bg-gold-500 text-black' : 'bg-white/5 text-zinc-300'}`}>{language === 'uz' ? category.name : category.nameRu}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {visibleProducts.map(product => {
              const qty = draft[product.id] || 0;
              const sellable = isSellable(product);
              const low = isStockTracked(product) && isLowStock(product);
              return (
                <div key={product.id} className={`flex flex-col overflow-hidden rounded-xl border-2 bg-graphite-800 transition-all ${qty > 0 ? 'border-gold-500' : 'border-white/5'} ${sellable ? '' : 'opacity-40'}`}>
                  <button type="button" disabled={!sellable} onClick={() => change(product.id, 1)} className="flex-1 p-3 text-left active:bg-white/5 disabled:cursor-not-allowed">
                    <div className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug">{nameOf(product)}</div>
                    <div className="mt-2 text-lg font-bold text-gold-400"><Price amount={product.salePrice} /></div>
                    {!sellable && <div className="text-xs font-semibold text-red-400">{t('Tugagan', 'Нет в наличии')}</div>}
                    {sellable && low && <div className="text-xs text-amber-400">{t('Qoldi', 'Осталось')}: {product.currentStock}</div>}
                  </button>
                  {qty > 0 && (
                    <div className="flex items-center justify-between border-t border-gold-500/30 bg-gold-500/10 px-2 py-1.5">
                      <button type="button" aria-label="-" onClick={() => change(product.id, -1)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 active:bg-white/20"><Minus className="h-4 w-4" /></button>
                      <span className="text-lg font-bold tabular-nums">{qty}</span>
                      <button type="button" aria-label="+" onClick={() => change(product.id, 1)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-500 text-black active:bg-gold-400"><Plus className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {visibleProducts.length === 0 && (
            <div className="stat-card empty-state text-sm text-zinc-500">
              {products.length === 0 ? t('Menyu hali bo‘sh — administrator mahsulotlarni qo‘shishi kerak.', 'Меню пока пусто — администратор должен добавить товары.') : t('Hech narsa topilmadi', 'Ничего не найдено')}
            </div>
          )}
        </section>

        {/* Xona hisobi */}
        <aside className={`mt-4 w-full shrink-0 space-y-4 lg:sticky lg:top-20 lg:mt-0 lg:w-[26rem] ${tab === 'bill' ? '' : 'hidden lg:block'}`}>
          <div className="stat-card space-y-4">
            <SessionClock session={session} size="lg" />
            <button type="button" onClick={() => setExtendOpen(true)} className="btn-secondary flex min-h-12 w-full items-center justify-center gap-2"><Clock className="h-5 w-5" />{t('+1 soat qo‘shish', '+1 час')}</button>
          </div>

          {draftCount > 0 && (
            <div className="stat-card !border-gold-500/60">
              <div className="mb-3 flex items-center gap-2 font-semibold"><ShoppingCart className="h-5 w-5 text-gold-400" />{t('Yangi buyurtma (hali yuborilmagan)', 'Новый заказ (не отправлен)')}</div>
              <div className="space-y-2">
                {draftItems.map(({ product, quantity }) => (
                  <div key={product.id} className="flex items-center gap-2 rounded-lg bg-white/[.04] p-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{nameOf(product)}</div>
                      <div className="text-xs text-zinc-500">{formatCurrency(product.salePrice)}</div>
                    </div>
                    <button type="button" aria-label="-" onClick={() => change(product.id, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><Minus className="h-4 w-4" /></button>
                    <b className="w-6 text-center tabular-nums">{quantity}</b>
                    <button type="button" aria-label="+" onClick={() => change(product.id, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><Plus className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <input value={note} onChange={event => setNote(event.target.value)} className="input-dark mt-3" placeholder={t('Izoh (masalan: muzsiz)', 'Комментарий (например: без льда)')} />
              <div className="mt-3 flex items-center justify-between text-lg font-bold"><span>{t('Jami', 'Итого')}</span><span className="text-gold-400">{formatCurrency(draftTotal)}</span></div>
              <button type="button" onClick={commit} disabled={committing} className="btn-gold mt-3 min-h-14 w-full text-base">{t('XONAGA QO‘SHISH', 'ДОБАВИТЬ В КОМНАТУ')}</button>
              <p className="mt-2 text-center text-xs text-zinc-500">{t('Yuborilgandan keyin faqat admin bekor qila oladi', 'После отправки отменить может только админ')}</p>
            </div>
          )}

          <div className="stat-card">
            <h2 className="mb-3 font-semibold">{t('Buyurtmalar', 'Заказы')} ({sessionOrders.filter(o => o.status !== 'cancelled').length})</h2>
            {sessionOrders.length === 0 && <p className="text-sm text-zinc-500">{t('Hali buyurtma yo‘q — menyudan tanlang', 'Заказов пока нет — выберите из меню')}</p>}
            <div className="space-y-2.5">
              {sessionOrders.map(order => (
                <div key={order.id} className={`rounded-lg bg-white/[.04] p-3 text-sm ${order.status === 'cancelled' ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{order.orderNumber} <span className="text-xs font-normal text-zinc-500">{formatTime(order.createdAt)}</span></div>
                    <span className={`status-badge ${orderStatusTone[order.status]}`}>{orderStatusLabel(order.status, language)}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-zinc-300">
                    {order.items.map(item => (
                      <li key={item.id} className={`flex justify-between gap-3 ${item.voided || order.status === 'cancelled' ? 'text-zinc-500 line-through' : ''}`}>
                        <span>{item.quantity} × {language === 'uz' ? item.productName : item.productNameRu}</span>
                        <span className="shrink-0">{formatCurrency(item.totalPrice)}</span>
                      </li>
                    ))}
                  </ul>
                  {order.notes && <div className="mt-2 text-xs text-amber-300">“{order.notes}”</div>}
                  {order.status === 'cancelled' && <div className="mt-2 text-xs text-red-300">{t('Admin tomonidan bekor qilingan', 'Отменено администратором')}{order.cancelReason ? `: ${order.cancelReason}` : ''}</div>}
                  {order.status === 'ready' && (
                    <button type="button" onClick={() => serve(order.id)} className="btn-gold mt-3 flex min-h-12 w-full items-center justify-center gap-2"><PackageCheck className="h-5 w-5" />{t('YETKAZILDI', 'ВЫДАНО')}</button>
                  )}
                  {(order.status === 'new' || order.status === 'accepted' || order.status === 'preparing') && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500"><Check className="h-3.5 w-3.5" />{t('Bar tayyorlamoqda', 'Бар готовит')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="stat-card">
            <h2 className="mb-3 font-semibold">{t('Hisob', 'Счёт')}</h2>
            <BillSummary bill={bill} showLines={false} />
            <div className="mt-4 grid gap-2">
              <button type="button" onClick={printBill} className="btn-gold flex min-h-12 items-center justify-center gap-2"><Printer className="h-5 w-5" />{t('Hisobni chop etish (shot)', 'Распечатать счёт')}</button>
              <button type="button" onClick={sendRequest} disabled={requested} className="btn-secondary flex min-h-12 items-center justify-center gap-2 disabled:opacity-60"><BellRing className="h-5 w-5" />{requested ? t('So‘rov yuborildi', 'Запрос отправлен') : t('Kassaga to‘lov so‘rovi', 'Запросить оплату на кассе')}</button>
            </div>
          </div>
        </aside>
      </div>

      {/* Telefonda: menyu ustida suzuvchi savat paneli */}
      {tab === 'menu' && draftCount > 0 && (
        <div className="no-print fixed inset-x-3 bottom-20 z-30 lg:hidden">
          <button type="button" onClick={() => setCartOpen(true)} className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-gold-500 px-5 font-bold text-black shadow-2xl shadow-black/50">
            <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" />{draftCount} {t('ta', 'шт.')}</span>
            <span>{formatCurrency(draftTotal)}</span>
            <span>{t('Ko‘rish', 'Открыть')} →</span>
          </button>
        </div>
      )}

      {/* Telefon uchun savat oynasi */}
      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title={t('Yangi buyurtma', 'Новый заказ')}
        footer={<button type="button" onClick={commit} disabled={!draftCount || committing} className="btn-gold min-h-14 w-full text-base">{t('XONAGA QO‘SHISH', 'ДОБАВИТЬ В КОМНАТУ')} · {formatCurrency(draftTotal)}</button>}
      >
        <div className="space-y-2">
          {draftItems.map(({ product, quantity }) => (
            <div key={product.id} className="flex items-center gap-2 rounded-lg bg-white/[.04] p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{nameOf(product)}</div>
                <div className="text-xs text-zinc-500">{formatCurrency(product.salePrice)}</div>
              </div>
              <button type="button" aria-label="-" onClick={() => change(product.id, -1)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10"><Minus className="h-4 w-4" /></button>
              <b className="w-6 text-center tabular-nums">{quantity}</b>
              <button type="button" aria-label="+" onClick={() => change(product.id, 1)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10"><Plus className="h-4 w-4" /></button>
            </div>
          ))}
          {!draftCount && <p className="py-6 text-center text-sm text-zinc-500">{t('Savat bo‘sh', 'Корзина пуста')}</p>}
        </div>
        <input value={note} onChange={event => setNote(event.target.value)} className="input-dark mt-3" placeholder={t('Izoh (masalan: muzsiz)', 'Комментарий (например: без льда)')} />
        <p className="mt-3 text-center text-xs text-zinc-500">{t('Yuborilgandan keyin faqat admin bekor qila oladi', 'После отправки отменить может только админ')}</p>
      </Modal>

      <ConfirmDialog
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        onConfirm={doExtend}
        title={t('1 soat qo‘shilsinmi?', 'Добавить 1 час?')}
        confirmLabel={t('Ha, qo‘shish', 'Да, добавить')}
        message={<div className="space-y-1"><div>{session.bookedHours} → <b>{session.bookedHours + 1} {t('soat', 'ч')}</b></div><div>{t('Qo‘shimcha', 'Дополнительно')}: <b className="text-gold-400">{formatCurrency(session.hourlyPriceSnapshot)}</b></div></div>}
      />

      <ReceiptModal data={receipt} onClose={() => setReceipt(null)} onPrint={logPrint} />
    </div>
  );
}
