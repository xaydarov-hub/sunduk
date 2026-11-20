'use client';

import { useState } from 'react';
import { ModulePage } from '@/components/shared/ModulePage';
import { useStore } from '@/lib/store';
import { formatDateTime, isLowStock, isStockTracked } from '@/lib/utils';
import { inventoryTypeLabel } from '@/lib/labels';
import { useT } from '@/lib/hooks';

export default function InventoryPage() {
  const t = useT();
  const { products, inventoryMovements, language, currentUser, addInventoryMovement, addToast } = useStore();
  const [productId, setProductId] = useState('');
  const [type, setType] = useState<'in' | 'out' | 'waste'>('in');
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState('');
  const tracked = products.filter(p => p.isActive && isStockTracked(p));

  const save = async () => {
    const product = products.find(item => item.id === productId);
    if (!product || quantity <= 0 || !currentUser) { addToast({ type: 'error', title: t('Mahsulot va miqdorni tanlang', 'Выберите товар и количество'), message: '' }); return; }
    const result = await addInventoryMovement({ productId, type, quantity, reason });
    if (!result.ok) { addToast({ type: 'error', title: t('Saqlanmadi', 'Не сохранено'), message: result.error }); return; }
    addToast({ type: 'success', title: t('Ombor harakati saqlandi', 'Движение склада сохранено'), message: '' });
    setQuantity(0); setReason('');
  };

  return (
    <ModulePage title={t('Ombor', 'Склад')} subtitle={t('Faqat qoldig‘i yuritiladigan mahsulotlar. Qoldiqni yuritish “Mahsulotlar” bo‘limida yoqiladi.', 'Только товары с учётом остатка. Учёт включается в разделе «Товары».')}>
      <section className="stat-card grid gap-3 md:grid-cols-4">
        <select className="input-dark" value={productId} onChange={e => setProductId(e.target.value)}><option value="">{t('Mahsulot', 'Товар')}</option>{tracked.map(product => <option key={product.id} value={product.id}>{language === 'uz' ? product.name : product.nameRu}</option>)}</select>
        <select className="input-dark" value={type} onChange={e => setType(e.target.value as typeof type)}><option value="in">{inventoryTypeLabel('in', language)}</option><option value="out">{inventoryTypeLabel('out', language)}</option><option value="waste">{inventoryTypeLabel('waste', language)}</option></select>
        <input className="input-dark" type="number" min="1" value={quantity || ''} onChange={e => setQuantity(Number(e.target.value))} placeholder={t('Miqdor', 'Количество')} />
        <button className="btn-gold" onClick={save}>{t('Saqlash', 'Сохранить')}</button>
        <input className="input-dark md:col-span-4" value={reason} onChange={e => setReason(e.target.value)} placeholder={t('Sabab', 'Причина')} />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="stat-card">
          <h2 className="font-semibold">{t('Qoldiq', 'Остатки')}</h2>
          {tracked.map(p => (
            <div key={p.id} className="flex justify-between border-b border-white/5 py-3 last:border-0">
              <span>{language === 'uz' ? p.name : p.nameRu}</span>
              <b className={isLowStock(p) ? 'text-red-400' : 'text-gold-400'}>{p.currentStock} {p.unit}</b>
            </div>
          ))}
          {tracked.length === 0 && <p className="py-6 text-sm text-zinc-500">{t('Qoldiq yuritiladigan mahsulot yo‘q', 'Нет товаров с учётом остатка')}</p>}
        </section>
        <section className="stat-card">
          <h2 className="font-semibold">{t('Harakatlar', 'Движения')}</h2>
          {inventoryMovements.slice().reverse().slice(0, 15).map(m => {
            const plus = m.type === 'in' || m.type === 'return';
            return (
              <div key={m.id} className="border-b border-white/5 py-3 last:border-0">
                <div className="flex justify-between text-sm"><span>{m.productName}</span><b className={plus ? 'text-green-400' : 'text-red-400'}>{m.type === 'inventory' ? '=' : plus ? '+' : '-'}{m.quantity}</b></div>
                <div className="text-xs text-zinc-500">{inventoryTypeLabel(m.type, language)} · {formatDateTime(m.createdAt)}</div>
                {m.reason && <div className="mt-1 text-xs text-zinc-400">{m.reason}</div>}
              </div>
            );
          })}
        </section>
      </div>
    </ModulePage>
  );
}
