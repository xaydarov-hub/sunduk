'use client';

import { useMemo, useState } from 'react';
import { Banknote, CreditCard, Minus, Plus, Search, ShoppingCart, Smartphone, Trash2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { buildBarReceipt, ReceiptData } from '@/lib/receipt';
import { formatCurrency, isLowStock, isSellable, isStockTracked } from '@/lib/utils';
import { paymentMethodLabel, PAYMENT_METHODS } from '@/lib/labels';
import { useT } from '@/lib/hooks';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Price } from '@/components/ui/Price';
import { useDevicePrefs } from '@/lib/devicePrefs';
import { ReceiptModal } from '@/components/receipt/ReceiptModal';
import { PaymentMethod } from '@/types';

const methodIcon: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, electronic: Smartphone };

/** Bar POS: xonasiz to'g'ridan-to'g'ri savdo — to'lov qabul qilinadi va chek chiqariladi. */
export default function BarPosPage() {
  const t = useT();
  const { products, categories, language, checkoutBarSale, currentUser, logActivity, addToast } = useStore();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState(0);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const activeCategories = useMemo(() => categories.filter(c => c.isActive !== false).sort((a, b) => (a.order || 0) - (b.order || 0)), [categories]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => p.isActive && (category === 'all' || p.categoryId === category) && (!q || `${p.name} ${p.nameRu}`.toLowerCase().includes(q)));
  }, [products, category, search]);

  const items = products.filter(p => cart[p.id] > 0).map(p => ({ product: p, quantity: cart[p.id] }));
  const total = items.reduce((sum, i) => sum + i.quantity * i.product.salePrice, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const change = method === 'cash' && tendered > total ? tendered - total : 0;
  const nameOf = (p: { name: string; nameRu: string }) => (language === 'uz' ? p.name : p.nameRu);

  const change_ = (productId: string, delta: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (delta > 0 && (!isSellable(product) || (isStockTracked(product) && (cart[productId] || 0) >= product.currentStock))) {
      addToast({ type: 'warning', title: t('Qoldiq yetarli emas', 'Недостаточно на складе'), message: nameOf(product) });
      return;
    }
    setCart(prev => {
      const next = Math.max(0, Math.min(99, (prev[productId] || 0) + delta));
      const copy = { ...prev };
      if (next === 0) delete copy[productId]; else copy[productId] = next;
      return copy;
    });
  };

  const autoPrintReceipt = useDevicePrefs(state => state.autoPrintReceipt);

  /** Shtrix-kod skaneri (klaviatura kabi yozadi + Enter) yoki aniq nom: mahsulotni darhol savatga qo'shadi. */
  const submitSearch = () => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const byCode = products.find(p => p.isActive && p.barcode && p.barcode.toLowerCase() === q);
    const target = byCode ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (target) { change_(target.id, 1); setSearch(''); }
    else addToast({ type: 'warning', title: t('Aniq bitta mahsulot topilmadi', 'Не найден один товар'), message: q });
  };

  const checkout = async () => {
    if (!items.length) return;
    const result = await checkoutBarSale({ items: items.map(i => ({ productId: i.product.id, quantity: i.quantity })), method });
    if (!result.ok) { addToast({ type: 'error', title: t('Savdo bajarilmadi', 'Продажа не выполнена'), message: result.error }); return; }
    const state = useStore.getState();
    const data = buildBarReceipt({ order: result.order, payment: result.payment, settings: state.settings, users: state.users, lang: state.language });
    setReceipt({ ...data, change: change > 0 ? change : undefined });
    setCart({});
    setTendered(0);
    addToast({ type: 'success', title: t('Savdo yakunlandi', 'Продажа завершена'), message: `${result.payment.receiptNumber} · ${formatCurrency(result.payment.amount)}` });
  };

  const logPrint = (data: ReceiptData) => {
    if (!currentUser) return;
    logActivity({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'receipt_printed', details: `Chek ${data.number} chop etildi`, entity: 'receipt', entityId: data.number });
  };

  return (
    <div className="page-container !p-3 sm:!p-6 lg:flex lg:gap-5">
      <div className="min-w-0 flex-1">
        <div className="section-header">
          <div>
            <h1 className="text-2xl font-bold">{t('Yangi savdo', 'Новая продажа')}</h1>
            <p className="mt-1 text-sm text-zinc-500">{t('Bar kassasi — to‘lov va chek bilan', 'Касса бара — с оплатой и чеком')}</p>
          </div>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-3 h-5 w-5 text-zinc-500" />
          <input className="input-dark !py-3 pl-10" autoFocus value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submitSearch(); } }} placeholder={t('Qidirish yoki shtrix-kod skanerlash (Enter)', 'Поиск или сканирование штрихкода (Enter)')} />
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setCategory('all')} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold ${category === 'all' ? 'bg-gold-500 text-black' : 'bg-white/5 text-zinc-300'}`}>{t('Barchasi', 'Все')}</button>
          {activeCategories.map(c => <button key={c.id} onClick={() => setCategory(c.id)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold ${category === c.id ? 'bg-gold-500 text-black' : 'bg-white/5 text-zinc-300'}`}>{language === 'uz' ? c.name : c.nameRu}</button>)}
        </div>
        {products.length === 0 && <div className="stat-card empty-state mb-3 text-sm text-zinc-500">{t('Menyu hali bo‘sh — administrator mahsulotlarni qo‘shishi kerak.', 'Меню пока пусто — администратор должен добавить товары.')}</div>}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map(p => {
            const qty = cart[p.id] || 0;
            const sellable = isSellable(p);
            return (
              <button key={p.id} type="button" disabled={!sellable} onClick={() => change_(p.id, 1)} className={`stat-card text-left disabled:cursor-not-allowed disabled:opacity-40 ${qty > 0 ? '!border-gold-500' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="line-clamp-2 min-h-10 text-sm font-semibold">{nameOf(p)}</div>
                  {qty > 0 && <span className="rounded-full bg-gold-500 px-2 py-0.5 text-xs font-bold text-black">{qty}</span>}
                </div>
                <div className="mt-2 text-lg font-bold text-gold-400"><Price amount={p.salePrice} /></div>
                <div className={`mt-1 text-xs ${!sellable ? 'font-semibold text-red-400' : isLowStock(p) ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {!sellable ? t('Tugagan', 'Нет в наличии') : isStockTracked(p) ? `${p.currentStock} ${p.unit}` : ' '}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="mt-5 w-full shrink-0 rounded-xl border border-white/5 bg-[#171717] lg:sticky lg:top-20 lg:mt-0 lg:w-96 lg:self-start">
        <div className="flex items-center gap-2 border-b border-white/5 p-4 font-semibold"><ShoppingCart className="h-5 w-5 text-gold-400" />{t('Savat', 'Корзина')}<span className="ml-auto text-xs text-zinc-500">{count}</span></div>
        <div className="max-h-[40vh] space-y-2 overflow-y-auto p-3">
          {items.map(({ product, quantity }) => (
            <div key={product.id} className="rounded-lg bg-white/[.03] p-3">
              <div className="text-sm font-medium">{nameOf(product)}</div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => change_(product.id, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><Minus className="h-4 w-4" /></button>
                  <span className="w-6 text-center font-bold tabular-nums">{quantity}</span>
                  <button onClick={() => change_(product.id, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><Plus className="h-4 w-4" /></button>
                </div>
                <span className="text-sm font-semibold text-gold-400">{formatCurrency(quantity * product.salePrice)}</span>
                <button onClick={() => setCart(prev => { const copy = { ...prev }; delete copy[product.id]; return copy; })} aria-label="Remove"><Trash2 className="h-4 w-4 text-zinc-500 hover:text-red-400" /></button>
              </div>
            </div>
          ))}
          {!items.length && <p className="p-8 text-center text-sm text-zinc-500">{t('Savat bo‘sh', 'Корзина пуста')}</p>}
        </div>
        <div className="space-y-3 border-t border-white/5 p-4">
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(m => {
              const Icon = methodIcon[m];
              return (
                <button key={m} type="button" onClick={() => setMethod(m)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border-2 text-xs font-semibold ${method === m ? 'border-gold-500 bg-gold-500/15 text-gold-400' : 'border-white/10 text-zinc-400'}`}>
                  <Icon className="h-5 w-5" />{paymentMethodLabel(m, language)}
                </button>
              );
            })}
          </div>
          {method === 'cash' && (
            <div>
              <div className="mb-1 text-xs text-zinc-500">{t('Berilgan summa (qaytim uchun)', 'Получено (для сдачи)')}</div>
              <MoneyInput value={tendered} onChange={setTendered} placeholder={String(total)} />
              {change > 0 && <div className="mt-1 text-sm font-semibold text-green-400">{t('Qaytim', 'Сдача')}: {formatCurrency(change)}</div>}
            </div>
          )}
          <div className="flex items-center justify-between text-lg font-bold"><span>{t('Jami', 'Итого')}</span><span className="text-gold-400">{formatCurrency(total)}</span></div>
          <button disabled={!items.length} onClick={checkout} className="btn-gold min-h-14 w-full text-base">{t('TO‘LASH VA CHEK', 'ОПЛАТИТЬ И ЧЕК')}</button>
        </div>
      </aside>

      <ReceiptModal data={receipt} onClose={() => setReceipt(null)} onPrint={logPrint} autoPrint={autoPrintReceipt} />
    </div>
  );
}
