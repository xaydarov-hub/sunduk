'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, BellRing, CreditCard, Printer, Smartphone, Wallet } from 'lucide-react';
import { fetchSessionBundle, useStore } from '@/lib/store';
import { calculateCombinedBill } from '@/lib/calculations';
import { buildSessionReceipt, ReceiptData } from '@/lib/receipt';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { nowMs } from '@/lib/clock';
import { useDevicePrefs } from '@/lib/devicePrefs';
import { useNow, useT } from '@/lib/hooks';
import { BillSummary } from '@/components/shared/BillSummary';
import { SessionClock } from '@/components/shared/SessionClock';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { CashbackApplied, CashbackRedeem } from '@/components/shared/CashbackRedeem';
import { CustomItemDialog, CustomItemValue } from '@/components/shared/CustomItemDialog';
import { confirmCashback, redeemCashback, refundCashback } from '@/lib/loyalty/api';
import { ReceiptModal } from '@/components/receipt/ReceiptModal';
import { paymentMethodLabel } from '@/lib/labels';
import { PaymentMethod } from '@/types';

const methodIcon: Record<'cash' | 'card' | 'electronic', typeof Banknote> = { cash: Banknote, card: CreditCard, electronic: Smartphone };
type Amounts = { cash: number; card: number; electronic: number };
const EMPTY: Amounts = { cash: 0, card: 0, electronic: 0 };

/** Naqd to'lov uchun tez summalar: aniq qoldiq, yaxlitlangan va oddiy kupyuralar. */
function quickCash(remaining: number): number[] {
  const up = (step: number) => Math.ceil(remaining / step) * step;
  const values = new Set<number>([remaining, up(10000), up(50000), up(100000)]);
  [200000, 500000, 1000000].forEach(value => { if (value >= remaining) values.add(value); });
  return Array.from(values).filter(value => value > 0).sort((a, b) => a - b).slice(0, 5);
}

interface PaymentPanelProps {
  /** Berilsa ro'yxat yashiriladi va faqat shu xona uchun to'lov oynasi ko'rsatiladi. */
  fixedSessionId?: string;
  onPaid?: () => void;
}

/** Kassa: xona hisobini ko'rish, chegirma berish, to'lov qabul qilish va chek chiqarish (bar va admin uchun). */
export function PaymentPanel({ fixedSessionId, onPaid }: PaymentPanelProps) {
  const t = useT();
  const language = useStore(state => state.language);
  const { sessions, orders, payments, settings, users, currentUser, notifications, paySession, addCustomItem, logActivity, addToast } = useStore();
  const autoPrintReceipt = useDevicePrefs(state => state.autoPrintReceipt);
  const now = useNow(1000);
  const [pickedId, setPickedId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [amounts, setAmounts] = useState<Amounts>(EMPTY);
  const [bonus, setBonus] = useState<CashbackApplied | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const closeAfterReceipt = useRef(false);
  const [paying, setPaying] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  // Ofitsiant "kassaga to'lov so'rovi" yuborgan xonalar (so'nggi 60 daqiqa) — ro'yxatda birinchi
  const requestedIds = useMemo(
    () => new Set(notifications.filter(n => n.reference && n.targetRole !== 'waiter' && nowMs() - new Date(n.createdAt).getTime() < 60 * 60 * 1000).map(n => n.reference as string)),
    [notifications, now],
  );
  const active = useMemo(
    () => sessions
      .filter(s => s.status === 'active')
      .sort((a, b) => Number(requestedIds.has(b.id)) - Number(requestedIds.has(a.id)) || a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })),
    [sessions, requestedIds],
  );
  const sessionId = fixedSessionId || pickedId;
  const session = active.find(s => s.id === sessionId);

  // Sessiya tanlanganda saqlangan chegirmani yuklaymiz
  useEffect(() => {
    setDiscount(session?.discount || 0);
    setAmounts(EMPTY);
    setBonus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const bill = session ? calculateCombinedBill(session, orders, payments, settings, { discount, at: now }) : null;
  const remaining = bill?.remaining ?? 0;
  const bonusAmount = bonus ? Math.min(bonus.amount, remaining) : 0;
  const dueAfterBonus = Math.max(0, remaining - bonusAmount);
  const nonCash = amounts.card + amounts.electronic;
  const cashApplied = Math.min(amounts.cash, Math.max(0, dueAfterBonus - nonCash));
  const applied = cashApplied + nonCash + bonusAmount;
  const change = amounts.cash - cashApplied;
  const tooMuch = nonCash > dueAfterBonus;
  const canPay = !!session && !!bill && applied > 0 && !tooMuch;
  const willClose = !!bill && applied >= remaining && applied > 0;

  const setAmount = (method: keyof Amounts, value: number) => setAmounts(current => ({ ...current, [method]: value }));
  const fillRemaining = (method: keyof Amounts) => setAmounts({ ...EMPTY, [method]: dueAfterBonus });

  /** "=" tugmasi: menyudan tashqari narsani (jarima va h.k.) xona hisobiga qo'shadi. */
  const addCustom = async (item: CustomItemValue) => {
    if (!session) return false;
    const result = await addCustomItem({ sessionId: session.id, ...item });
    if (!result.ok) {
      addToast({ type: 'error', title: t('Qo‘shilmadi', 'Не добавлено'), message: result.error });
      return false;
    }
    addToast({ type: 'success', title: t('Hisobga qo‘shildi', 'Добавлено в счёт'), message: `${item.quantity} × ${item.name} — ${formatCurrency(item.quantity * item.price)}` });
    return true;
  };

  const printBill = () => {
    if (!session) return;
    const data = buildSessionReceipt({ kind: 'bill', session, orders, payments, settings, users, lang: language, discount });
    setReceipt(data);
  };

  const pay = async () => {
    if (!session || !bill || !canPay || paying) return;
    setPaying(true);
    // Cashback: avval mijoz balansidan yechamiz; to'lov bajarilmasa qaytaramiz
    let redemptionId: string | undefined;
    if (bonus && bonusAmount > 0) {
      const redeemed = await redeemCashback({ code: bonus.code, amount: bonusAmount, due: remaining });
      if (!redeemed.ok) {
        setPaying(false);
        addToast({ type: 'error', title: t('Cashback qo‘llanmadi', 'Кэшбэк не применён'), message: redeemed.error });
        if (redeemed.code === 'CODE_USED' || redeemed.code === 'CODE_EXPIRED' || redeemed.code === 'CODE_INVALID') setBonus(null);
        return;
      }
      redemptionId = redeemed.id;
    }
    const result = await paySession({
      sessionId: session.id,
      discount,
      parts: [
        { method: 'cash', amount: cashApplied },
        { method: 'card', amount: amounts.card },
        { method: 'electronic', amount: amounts.electronic },
        ...(redemptionId ? [{ method: 'bonus' as const, amount: bonusAmount, redemptionId }] : []),
      ],
    });
    setPaying(false);
    if (!result.ok) {
      if (redemptionId) void refundCashback(redemptionId);
      addToast({ type: 'error', title: t('To‘lov qabul qilinmadi', 'Платёж не принят'), message: result.error });
      return;
    }
    if (redemptionId) void confirmCashback(redemptionId, result.receiptNumber);
    setBonus(null);
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
    setAmounts(EMPTY);
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
              <button key={item.id} type="button" onClick={() => setPickedId(item.id)} className={`stat-card w-full text-left ${selected ? '!border-gold-500/70 bg-gold-500/5' : ''} ${requestedIds.has(item.id) && !selected ? '!border-amber-500/60' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-lg font-bold">{item.roomNumber}{requestedIds.has(item.id) && <span className="flex animate-pulse items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-black"><BellRing className="h-3 w-3" />{t('Hisob so‘ralgan', 'Просят счёт')}</span>}</div>
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
              <button type="button" onClick={() => setCustomOpen(true)} disabled={paying} className="btn-secondary flex min-h-12 w-full items-center justify-center gap-2.5 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-500/20 text-xl font-black leading-none text-gold-400">=</span>
                {t('Menyudan tashqari qo‘shish (jarima va h.k.)', 'Добавить вне меню (штраф и т.п.)')}
              </button>
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

              <CashbackRedeem due={remaining} applied={bonus} onChange={setBonus} disabled={paying || remaining <= 0} />

              <div className="space-y-3">
                <div className="text-sm font-medium text-zinc-300">{t('To‘lov usuli', 'Способ оплаты')}</div>
                {(['cash', 'card', 'electronic'] as const).map(method => {
                  const Icon = methodIcon[method];
                  return (
                    <div key={method} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex w-28 shrink-0 items-center gap-2 text-sm text-zinc-300"><Icon className="h-4 w-4 shrink-0 text-gold-400" />{paymentMethodLabel(method, language)}</div>
                        <MoneyInput value={amounts[method]} onChange={value => setAmount(method, value)} placeholder="0" />
                        <button type="button" onClick={() => fillRemaining(method)} disabled={dueAfterBonus <= 0} className="btn-secondary shrink-0 px-3 text-xs">{t('To‘liq', 'Всё')}</button>
                      </div>
                      {method === 'cash' && dueAfterBonus > 0 && (
                        <div className="flex flex-wrap gap-1.5 pl-[7.5rem]">
                          {quickCash(dueAfterBonus).map(value => (
                            <button key={value} type="button" onClick={() => setAmounts({ ...EMPTY, cash: value })} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${amounts.cash === value && !nonCash ? 'bg-gold-500 text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}>
                              {value === dueAfterBonus ? t('Aniq', 'Точно') : formatNumber(value)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5 rounded-lg bg-black/25 p-3 text-sm">
                <div className="flex justify-between"><span className="text-zinc-400">{t('To‘lanadi', 'К оплате')}</span><b>{formatCurrency(remaining)}</b></div>
                {bonusAmount > 0 && <div className="flex justify-between"><span className="text-zinc-400">{t('Cashback bilan', 'Кэшбэком')}</span><b className="text-green-300">−{formatCurrency(bonusAmount)}</b></div>}
                <div className="flex justify-between"><span className="text-zinc-400">{t('Qabul qilinadi', 'Принимается')}</span><b className="text-gold-400">{formatCurrency(applied)}</b></div>
                {change > 0 && <div className="flex items-center justify-between rounded-lg bg-green-500/15 px-3 py-2 text-green-300"><span className="font-semibold">{t('Qaytim', 'Сдача')}</span><b className="text-2xl">{formatCurrency(change)}</b></div>}
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

      <CustomItemDialog open={customOpen} onClose={() => setCustomOpen(false)} onSubmit={addCustom} />
      <ReceiptModal data={receipt} onClose={closeReceipt} onPrint={logPrint} autoPrint={autoPrintReceipt} />
    </div>
  );
}
