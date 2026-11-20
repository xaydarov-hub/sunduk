'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ModulePage } from '@/components/shared/ModulePage';
import { Modal } from '@/components/ui/Modal';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { useStore } from '@/lib/store';
import { formatCurrency, isLowStock, isStockTracked } from '@/lib/utils';
import { useT } from '@/lib/hooks';
import { Product } from '@/types';

interface FormState {
  name: string; nameRu: string; categoryId: string; salePrice: number; costPrice: number;
  unit: string; trackStock: boolean; currentStock: number; minStock: number;
}

export default function AdminProductsPage() {
  const t = useT();
  const { products, categories, language, addProduct, updateProduct, addToast } = useStore();
  const empty = (): FormState => ({ name: '', nameRu: '', categoryId: categories[0]?.id || '', salePrice: 0, costPrice: 0, unit: 'dona', trackStock: false, currentStock: 0, minStock: 0 });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter(p => (categoryFilter === 'all' || p.categoryId === categoryFilter) && (!q || `${p.name} ${p.nameRu}`.toLowerCase().includes(q)));
  }, [products, query, categoryFilter]);

  const startNew = () => { setEditingId(null); setForm(empty()); setOpen(true); };
  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({ name: p.name, nameRu: p.nameRu, categoryId: p.categoryId, salePrice: p.salePrice, costPrice: p.costPrice, unit: p.unit, trackStock: isStockTracked(p), currentStock: p.currentStock, minStock: p.minStock });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim() || !form.categoryId || form.salePrice <= 0) { addToast({ type: 'error', title: t('Nom, kategoriya va sotuv narxini kiriting', 'Укажите название, категорию и цену'), message: '' }); return; }
    const data = {
      name: form.name.trim(), nameRu: form.nameRu.trim() || form.name.trim(), categoryId: form.categoryId,
      salePrice: form.salePrice, costPrice: form.costPrice, unit: form.unit.trim() || 'dona',
      trackStock: form.trackStock, currentStock: form.trackStock ? form.currentStock : 0, minStock: form.trackStock ? form.minStock : 0,
    };
    if (editingId) updateProduct(editingId, data);
    else addProduct({ ...data, isActive: true });
    addToast({ type: 'success', title: editingId ? t('Mahsulot yangilandi', 'Товар обновлён') : t('Mahsulot qo‘shildi', 'Товар добавлен'), message: form.name });
    setOpen(false);
  };

  return (
    <ModulePage title={t('Mahsulotlar', 'Товары')} subtitle={t('Menyu va narxlar', 'Меню и цены')} action={t('Yangi mahsulot', 'Новый товар')} onAction={startNew}>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-xs"><Search className="absolute left-3 top-3 h-5 w-5 text-zinc-500" /><input className="input-dark pl-10" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Qidirish', 'Поиск')} /></div>
        <select className="input-dark sm:max-w-xs" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
          <option value="all">{t('Barcha kategoriyalar', 'Все категории')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{language === 'uz' ? c.name : c.nameRu}</option>)}
        </select>
      </div>

      <div className="stat-card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>{t('Mahsulot', 'Товар')}</th><th>{t('Kategoriya', 'Категория')}</th><th>{t('Tannarx', 'Себестоимость')}</th><th>{t('Narx', 'Цена')}</th><th>{t('Qoldiq', 'Остаток')}</th><th /></tr></thead>
          <tbody>
            {list.map(product => (
              <tr key={product.id} className={product.isActive ? '' : 'opacity-50'}>
                <td><div className="font-medium">{language === 'uz' ? product.name : product.nameRu}</div><div className="text-xs text-zinc-500">{product.isActive ? t('Menyuda', 'В меню') : t('Yashirilgan', 'Скрыт')}</div></td>
                <td>{(() => { const c = categories.find(category => category.id === product.categoryId); return c ? (language === 'uz' ? c.name : c.nameRu) : '—'; })()}</td>
                <td>{formatCurrency(product.costPrice)}</td>
                <td className="font-semibold text-gold-400">{formatCurrency(product.salePrice)}</td>
                <td className={isLowStock(product) ? 'text-red-400' : ''}>{isStockTracked(product) ? `${product.currentStock} ${product.unit}` : <span className="text-zinc-600">{t('yuritilmaydi', 'не ведётся')}</span>}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => startEdit(product)}>{t('Tahrirlash', 'Изменить')}</button>
                    <button className={`${product.isActive ? 'btn-secondary' : 'btn-gold'} !px-3 !py-1.5 text-sm`} onClick={() => updateProduct(product.id, { isActive: !product.isActive })}>{product.isActive ? t('Yashirish', 'Скрыть') : t('Ko‘rsatish', 'Показать')}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">{t('Mahsulot topilmadi', 'Товары не найдены')}</p>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title={editingId ? t('Mahsulotni tahrirlash', 'Редактировать товар') : t('Yangi mahsulot', 'Новый товар')} footer={<div className="grid grid-cols-2 gap-3"><button className="btn-secondary min-h-12" onClick={() => setOpen(false)}>{t('Bekor qilish', 'Отмена')}</button><button className="btn-gold min-h-12" onClick={save}>{t('Saqlash', 'Сохранить')}</button></div>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-zinc-400">{t('Nomi (UZ)', 'Название (UZ)')}<input className="input-dark mt-1" value={form.name} onChange={event => set('name', event.target.value)} /></label>
          <label className="text-sm text-zinc-400">{t('Nomi (RU)', 'Название (RU)')}<input className="input-dark mt-1" value={form.nameRu} onChange={event => set('nameRu', event.target.value)} /></label>
          <label className="text-sm text-zinc-400">{t('Kategoriya', 'Категория')}<select className="input-dark mt-1" value={form.categoryId} onChange={event => set('categoryId', event.target.value)}>{categories.map(c => <option key={c.id} value={c.id}>{language === 'uz' ? c.name : c.nameRu}</option>)}</select></label>
          <label className="text-sm text-zinc-400">{t('O‘lchov birligi', 'Единица')}<input className="input-dark mt-1" value={form.unit} onChange={event => set('unit', event.target.value)} /></label>
          <label className="text-sm text-zinc-400">{t('Sotuv narxi', 'Цена продажи')}<MoneyInput className="mt-1" value={form.salePrice} onChange={value => set('salePrice', value)} /></label>
          <label className="text-sm text-zinc-400">{t('Tannarx', 'Себестоимость')}<MoneyInput className="mt-1" value={form.costPrice} onChange={value => set('costPrice', value)} /></label>
          <label className="flex items-center gap-3 rounded-xl bg-white/[.03] p-3 text-sm sm:col-span-2">
            <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={form.trackStock} onChange={event => set('trackStock', event.target.checked)} />
            <span>{t('Ombor qoldig‘i yuritilsin (0 bo‘lsa sotib bo‘lmaydi)', 'Вести остаток на складе (при 0 продажа блокируется)')}</span>
          </label>
          {form.trackStock && (
            <>
              <label className="text-sm text-zinc-400">{t('Hozirgi qoldiq', 'Текущий остаток')}<input className="input-dark mt-1" type="number" min="0" value={form.currentStock} onChange={event => set('currentStock', Number(event.target.value))} /></label>
              <label className="text-sm text-zinc-400">{t('Minimal qoldiq (ogohlantirish)', 'Мин. остаток (предупреждение)')}<input className="input-dark mt-1" type="number" min="0" value={form.minStock} onChange={event => set('minStock', Number(event.target.value))} /></label>
            </>
          )}
        </div>
      </Modal>
    </ModulePage>
  );
}
