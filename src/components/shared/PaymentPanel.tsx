'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CreditCard, Printer, Smartphone, Wallet } from 'lucide-react';
import { fetchSessionBundle, useStore } from '@/lib/store';
import { calculateCombinedBill } from '@/lib/calculations';
import { buildSessionReceipt, ReceiptData } from '@/lib/receipt';
import { formatCurrency } from '@/lib/utils';
import { useNow, useT } from '@/lib/hooks';
import { BillSummary } from '@/components/shared/BillSummary';
import { SessionClock } from '@/components/shared/SessionClock';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { ReceiptModal } from '@/components/receipt/ReceiptModal';
import { paymentMethodLabel } from '@/lib/labels';
import { PaymentMethod } from '@/types';

const methodIcon: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, electronic: Smartphone };

interface PaymentPanelProps {
  /** Berilsa ro'yxat yashiriladi va faqat shu xona uchun to'lov oynasi ko'rsatiladi. */
  fixedSessionId?: string;
  onPaid?: () => void;
}

/** Kassa: xona hisobini ko'rish, chegirma berish, to'lov qabul qilish va chek chiqarish (bar va admin uchun). */
export function PaymentPanel({ fixedSessionId, onPaid }: PaymentPanelProps) {
  const t = useT();
  const language = useStore(state => state.language);
  const { sessions, orders, payments, settings, users, currentUser, paySession, logActivity, addToast } = useStore();
  const now = useNow(1000);
  const [pickedId, setPickedId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [amounts, setAmounts] = useState<Record<PaymentMethod, number>>({ cash: 0, card: 0, electronic: 0 });
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const closeAfterReceipt = useRef(false);
  const [paying, setPaying] = useState(false);

  const active = useMemo(
    () => sessions.filter(s => s.status === 'active').sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })),
    [sessions],
  );
  const sessionId = fixedSessionId || pickedId;
  const session = active.find(s => s.id === sessionId);

  // Sessiya tanlanganda saqlangan chegirmani yuklaymiz
  useEffect(() => {
    setDiscount(session?.discount || 0);
    setAmounts({ cash: 0, card: 0, electronic: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const bill = session ? calculateCombinedBill(session, orders, payments, settings, { discount, at: now }) : null;
  const remaining = bill?.remaining ?? 0;
  const nonCash = amounts.card + amounts.electronic;
  const cashApplied = Math.min(amounts.cash, Math.max(0, remaining - nonCash));
  const applied = cashApplied + nonCash;
  const change = amounts.cash - cashApplied;
  const tooMuch = nonCash > remaining;
  const canPay = !!session && !!bill && applied > 0 && !tooMuch;
  const willClose = !!bill && applied >= remaining && applied > 0;

  const setAmount = (method: PaymentMethod, value: number) => setAmounts(current => ({ ...current, [method]: value }));
  const fillRemaining = (method: PaymentMethod) => setAmounts({ cash: 0, card: 0, electronic: 0, [method]: remaining });

  const printBill = () => {
    if (!session) return;
    const data = buildSessionReceipt({ kind: 'bill', session, orders, payments, settings, users, lang: language, discount });
    setReceipt(data);
  };

  const pay = async () => {
    if (!session || !bill || !canPay || paying) return;
    setPaying(true);
    const result = await paySession({
      sessionId: session.id,
      discount,
      parts: [
        { method: 'cash', amount: cashApplied },
        { method: 'card', amount: amounts.card },
        { method: 'electronic', amount: amounts.electronic },
      ],
    });
    setPaying(false);
    if (!result.ok) {
      addToast({ type: 'error', title: t('To‘lov qabul qilinmadi', 'Платёж не принят'), message: result.error });
      return;
    }
    // Chekni serverdagi yangi ma'lumotdan quramiz (yopilgan sessiya faol ro'yxatdan chiqib ketgan bo'lishi mumkin)
    let data: ReceiptData | null = null;
    try {
      const bundle = await fetchSessionBundle(session.id);
      if (bundle) data = buildSessionReceipt({ kind: 'receipt', session: bundle.session, orders: bundle.orders, payments: bundle.payments, settings, lang: language, receiptNumber: result.receiptNumber });
    } catch { /* quyida zaxira chek */ }
    if (!data) data = buildSessionReceipt({ kind: 'receipt', session, orders, payments, settings, users, lang: language, receiptNumber: result.receiptNumber });
    setReceipt({ ...data, change: change > 0 ? change : undefined });
    addToast({
      type: 'success',
      title: result.completed ? t('To‘lov qabul qilindi — xona yopildi', 'Оплата принята — комната закрыта') : t('Qisman to‘lov qabul qilindi', 'Частичная оплата принята'),
      message: `${formatCurrency(result.paid)}${result.remaining > 0 ? ` · ${t('qoldiq', 'остаток')} ${formatCurrency(result.remaining)}` : ''}`,
    });
    setAmounts({ cash: 0, card: 0, electronic: 0 });
    if (result.completed) { setPickedId(''); closeAfterReceipt.current = true; }
  };

  // To'lov yakunlangach chek yopilganda tashqi oyna (agar bo'lsa) yopiladi
  const closeReceipt = () => {
    setReceipt(null);
    if (closeAfterReceipt.current) { closeAfterReceipt.current = false; onPaid?.(); }
  };

  const logPrint = (data: ReceiptData) => {
    if (!currentUser) return;
    logActivity({
      userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role,
      action: data.kind === 'bill' ? 'bill_printed' : 'receipt_printed',
      details: `${data.kind === 'bill' ? 'Hisob (shot)' : `Chek ${data.number}`} chop etildi${data.room ? ` — ${data.room.number}` : ''}`,
      entity: 'receipt', entityId: data.number,
    });
  };

  return (
    <div className={fixedSessionId ? '' : 'grid gap-5 xl:grid-cols-[340px_1fr]'}>
      {!fixedSessionId && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-zinc-400">{t('Ochiq xonalar', 'Открытые комнаты')} ({active.length})</h2>
          {active.length === 0 && <div className="stat-card text-sm text-zinc-500">{t('Hozir ochiq xona yo‘q', 'Открытых комнат нет')}</div>}
          {active.map(item => {
            const b = calculateCombinedBill(item, orders, payments, settings, { at: now });
            const selected = item.id === sessionId;
            return (
              <button key={item.id} type="button" onClick={() => setPickedId(item.id)} className={`stat-card w-full text-left ${selected ? '!border-gold-500/70 bg-gold-500/5' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-lg font-bold">{item.roomNumber}</div>
                  <div className="text-lg font-bold text-gold-400">{formatCurrency(b.remaining)}</div>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-zinc-500">
                  <span className="truncate">{item.customerName || item.roomName}</span>
                  <span className={b.isOvertime ? 'text-red-400' : ''}>{item.bookedHours} {t('soat', 'ч')}{b.isOvertime ? ` · ${t('vaqt tugagan', 'время вышло')}` : ''}</span>
                </div>
              </button>
            );
          })}
        </section>
      )}

      <section>
        {!session || !bill ? (
          <div className="stat-card empty-state text-sm text-zinc-500">{fixedSessionId ? t('Bu xona yopilgan', 'Эта комната закрыта') : t('Chap tomondan xonani tanlang', 'Выберите комнату слева')}</div>
        ) : (
          <div className={`grid gap-4 ${fixedSessionId ? 'lg:grid-cols-2' : '2xl:grid-cols-2'}`}>
            <div className="stat-card space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold">{session.roomNumber}</div>
                  <div className="text-sm text-zinc-400">{session.customerName || session.roomName} · {session.waiterName}</div>
                </div>
              </div>
              <SessionClock session={session} size="sm" />
              <BillSummary bill={bill} />
            </div>

            <div className="stat-card space-y-4">
              <div>
                <div className="mb-1.5 text-sm font-medium text-zinc-300">{t('Chegirma', 'Скидка')}</div>
                <div className="flex gap-2">
                  <MoneyInput value={discount} onChange={setDiscount} placeholder="0" />
                  {[5, 10].map(percent => (
                    <button key={percent} type="button" onClick={() => setDiscount(Math.round(((bill.subtotal * percent) / 100) / 1000) * 1000)} className="btn-secondary shrink-0 px-3 text-sm">{percent}%</button>
                  ))}
                  <button type="button" onClick={() => setDiscount(0)} className="btn-ghost shrink-0 px-3 text-sm">0</button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium text-zinc-300">{t('To‘lov usuli', 'Способ оплаты')}</div>
                {(['cash', 'card', 'electronic'] as const).map(method => {
                  const Icon = methodIcon[method];
                  return (
                    <div key={method} className="flex items-center gap-2">
                      <div className="flex w-28 shrink-0 items-center gap-2 text-sm text-zinc-300"><Icon className="h-4 w-4 shrink-0 text-gold-400" />{paymentMethodLabel(method, language)}</div>
                      <MoneyInput value={amounts[method]} onChange={value => setAmount(method, value)} placeholder="0" />
                      <button type="button" onClick={() => fillRemaining(method)} disabled={remaining <= 0} className="btn-secondary shrink-0 px-3 text-xs">{t('To‘liq', 'Всё')}</button>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5 rounded-lg bg-black/25 p-3 text-sm">
                <div className="flex justify-between"><span className="text-zinc-400">{t('To‘lanadi', 'К оплате')}</span><b>{formatCurrency(remaining)}</b></div>
                <div className="flex justify-between"><span className="text-zinc-400">{t('Qabul qilinadi', 'Принимается')}</span><b className="text-gold-400">{formatCurrency(applied)}</b></div>
                {change > 0 && <div className="flex justify-between text-green-400"><span>{t('Qaytim', 'Сдача')}</span><b>{formatCurrency(change)}</b></div>}
                {tooMuch && <div className="text-red-400">{t('Karta/elektron summasi qoldiqdan oshib ketdi', 'Сумма карты/электронных превышает остаток')}</div>}
              </div>

              <div className="grid gap-2">
                <button type="button" onClick={pay} disabled={!canPay || paying} className="btn-gold flex min-h-14 items-center justify-center gap-2 text-base"><Wallet className="h-5 w-5 shrink-0" />{willClose ? t('To‘lash va yopish', 'Оплатить и закрыть') : t('Qisman to‘lov', 'Частичная оплата')}</button>
                <button type="button" onClick={printBill} className="btn-secondary flex min-h-12 items-center justify-center gap-2"><Printer className="h-4 w-4 shrink-0" />{t('Hisobni chiqarish (shot)', 'Распечатать счёт')}</button>
              </div>
            </div>
          </div>
        )}
      </section>

      <ReceiptModal data={receipt} onClose={closeReceipt} onPrint={logPrint} />
    </div>
  );
}
