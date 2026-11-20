'use client';

import { useState } from 'react';
import { ModulePage } from '@/components/shared/ModulePage';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { useStore } from '@/lib/store';
import { formatCurrency, formatDate, localDateKey } from '@/lib/utils';
import { EXPENSE_CATEGORIES, expenseCategoryLabel, paymentMethodLabel, PAYMENT_METHODS } from '@/lib/labels';
import { useT } from '@/lib/hooks';
import { ExpenseCategory, PaymentMethod } from '@/types';

export default function ExpensesPage() {
  const t = useT();
  const { expenses, language, currentUser, addExpense, addToast } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState(localDateKey());

  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const submit = () => {
    if (!description.trim() || amount <= 0 || !currentUser) { addToast({ type: 'error', title: t('Izoh va summani kiriting', 'Укажите описание и сумму'), message: '' }); return; }
    addExpense({ category, amount, date, description: description.trim(), paymentMethod: method, createdBy: currentUser.id });
    addToast({ type: 'success', title: t('Xarajat qo‘shildi', 'Расход добавлен'), message: formatCurrency(amount) });
    setDescription(''); setAmount(0); setCategory('other'); setDate(localDateKey()); setShowForm(false);
  };

  return (
    <ModulePage title={t('Xarajatlar', 'Расходы')} subtitle={`${t('Jami', 'Всего')}: ${formatCurrency(total)}`} action={t('Xarajat qo‘shish', 'Добавить расход')} onAction={() => setShowForm(!showForm)}>
      {showForm && (
        <div className="stat-card grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input className="input-dark md:col-span-2 xl:col-span-3" placeholder={t('Izoh', 'Описание')} value={description} onChange={e => setDescription(e.target.value)} />
          <MoneyInput value={amount} onChange={setAmount} placeholder={t('Summa', 'Сумма')} />
          <select className="input-dark" value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)}>{EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{expenseCategoryLabel(c, language)}</option>)}</select>
          <select className="input-dark" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{paymentMethodLabel(m, language)}</option>)}</select>
          <input className="input-dark" type="date" value={date} max={localDateKey()} onChange={e => setDate(e.target.value)} />
          <button onClick={submit} className="btn-gold md:col-span-2 xl:col-span-2">{t('Saqlash', 'Сохранить')}</button>
        </div>
      )}
      <div className="stat-card">
        {sorted.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">{t('Xarajatlar yo‘q', 'Расходов нет')}</p>}
        {sorted.map(e => (
          <div key={e.id} className="flex items-center justify-between gap-3 border-b border-white/5 py-3 last:border-0">
            <div>
              <div className="font-medium">{e.description}</div>
              <div className="text-xs text-zinc-500">{formatDate(e.date, language)} · {expenseCategoryLabel(e.category, language)} · {paymentMethodLabel(e.paymentMethod, language)}</div>
            </div>
            <div className="font-semibold text-red-400">-{formatCurrency(e.amount)}</div>
          </div>
        ))}
      </div>
    </ModulePage>
  );
}
