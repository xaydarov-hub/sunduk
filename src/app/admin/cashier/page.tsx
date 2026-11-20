'use client';

import { useState } from 'react';
import { ModulePage } from '@/components/shared/ModulePage';
import { PaymentPanel } from '@/components/shared/PaymentPanel';
import { ReceiptsList } from '@/components/shared/ReceiptsList';
import { useStore } from '@/lib/store';
import { formatCurrency, localDateKey } from '@/lib/utils';
import { paymentMethodLabel, PAYMENT_METHODS } from '@/lib/labels';
import { useT } from '@/lib/hooks';

export default function CashierPage() {
  const t = useT();
  const { payments, language } = useStore();
  const [tab, setTab] = useState<'pay' | 'receipts'>('pay');
  const today = localDateKey();
  const todays = payments.filter(p => p.status !== 'cancelled' && localDateKey(p.createdAt) === today);
  const totals = PAYMENT_METHODS.map(method => ({ method, amount: todays.filter(p => p.method === method).reduce((sum, p) => sum + p.amount, 0) }));
  const total = totals.reduce((sum, item) => sum + item.amount, 0);

  return (
    <ModulePage title={t('Kassa', 'Касса')} subtitle={t('Bugungi tushum, to‘lov qabul qilish va cheklar', 'Выручка за сегодня, приём оплаты и чеки')}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="stat-card"><div className="text-sm text-zinc-400">{t('Bugun jami', 'Всего сегодня')}</div><div className="mt-3 text-2xl font-bold text-gold-400">{formatCurrency(total)}</div></div>
        {totals.map(item => <div key={item.method} className="stat-card"><div className="text-sm text-zinc-400">{paymentMethodLabel(item.method, language)}</div><div className="mt-3 text-2xl font-bold">{formatCurrency(item.amount)}</div></div>)}
      </div>
      <div className="flex w-fit rounded-xl bg-white/5 p-1">
        {([['pay', t('To‘lov qabul qilish', 'Приём оплаты')], ['receipts', t('Cheklar', 'Чеки')]] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-5 py-2.5 text-sm font-semibold ${tab === value ? 'bg-gold-500 text-black' : 'text-zinc-400'}`}>{label}</button>
        ))}
      </div>
      {tab === 'pay' ? <PaymentPanel /> : <ReceiptsList />}
    </ModulePage>
  );
}
