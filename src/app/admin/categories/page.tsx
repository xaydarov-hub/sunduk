'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ModulePage } from '@/components/shared/ModulePage';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';
import { Category } from '@/types';

export default function CategoriesPage() {
  const t = useT();
  const { categories, products, language, addCategory, updateCategory, deleteCategory, addToast } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [deleting, setDeleting] = useState<Category | null>(null);
  const sorted = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));

  const save = () => {
    if (!name.trim()) { addToast({ type: 'error', title: t('Kategoriya nomini kiriting', 'Введите название категории'), message: '' }); return; }
    addCategory({ name: name.trim(), nameRu: nameRu.trim() || name.trim(), isActive: true, order: Math.max(0, ...categories.map(c => c.order || 0)) + 1 });
    addToast({ type: 'success', title: t('Kategoriya qo‘shildi', 'Категория добавлена'), message: name.trim() });
    setName(''); setNameRu(''); setShowForm(false);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await deleteCategory(deleting.id);
    addToast(result.ok
      ? { type: 'success', title: t('Kategoriya o‘chirildi', 'Категория удалена'), message: deleting.name }
      : { type: 'error', title: t('O‘chirilmadi', 'Не удалено'), message: result.error });
  };

  return (
    <ModulePage title={t('Kategoriyalar', 'Категории')} subtitle={t('Menyu bo‘limlari (Ichimliklar, Taomlar va h.k.). Avval kategoriya, keyin mahsulot qo‘shing.', 'Разделы меню (Напитки, Блюда и т.д.). Сначала категория, потом товары.')} action={t('Yangi kategoriya', 'Новая категория')} onAction={() => setShowForm(!showForm)}>
      {showForm && (
        <div className="stat-card grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input className="input-dark" value={name} onChange={event => setName(event.target.value)} placeholder={t('Nomi (UZ)', 'Название (UZ)')} />
          <input className="input-dark" value={nameRu} onChange={event => setNameRu(event.target.value)} placeholder={t('Nomi (RU) — ixtiyoriy', 'Название (RU) — необязательно')} />
          <button className="btn-gold" onClick={save}>{t('Saqlash', 'Сохранить')}</button>
        </div>
      )}
      {sorted.length === 0 && !showForm && (
        <div className="stat-card empty-state text-sm text-zinc-400">
          <p>{t('Hali kategoriya yo‘q.', 'Категорий пока нет.')}</p>
          <button className="btn-gold mt-4" onClick={() => setShowForm(true)}>{t('Birinchi kategoriyani qo‘shish', 'Добавить первую категорию')}</button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map(category => {
          const count = products.filter(p => p.categoryId === category.id).length;
          return (
            <article key={category.id} className="stat-card flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold-500/15 text-xl font-bold text-gold-400">{category.name.charAt(0)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{language === 'uz' ? category.name : category.nameRu}</div>
                <div className="text-xs text-zinc-500">{category.isActive === false ? t('Yashirilgan', 'Скрыта') : t('Menyuda', 'В меню')} · {count} {t('ta mahsulot', 'товаров')}</div>
              </div>
              <button className={`${category.isActive === false ? 'btn-gold' : 'btn-secondary'} !px-3 !py-1.5 text-sm`} onClick={() => updateCategory(category.id, { isActive: category.isActive === false })}>
                {category.isActive === false ? t('Ko‘rsatish', 'Показать') : t('Yashirish', 'Скрыть')}
              </button>
              <button className="rounded-lg p-2 text-red-400 hover:bg-red-500/15" aria-label={t('O‘chirish', 'Удалить')} title={t('O‘chirish', 'Удалить')} onClick={() => setDeleting(category)}>
                <Trash2 className="h-5 w-5" />
              </button>
            </article>
          );
        })}
      </div>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { void confirmDelete(); }}
        title={t('Kategoriyani o‘chirish', 'Удалить категорию')}
        message={deleting ? <b>{deleting.name}</b> : undefined}
        confirmLabel={t('O‘chirish', 'Удалить')}
        danger
      />
    </ModulePage>
  );
}
