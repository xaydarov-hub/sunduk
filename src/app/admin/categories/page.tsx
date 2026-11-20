'use client';

import { useState } from 'react';
import { ModulePage } from '@/components/shared/ModulePage';
import { useStore } from '@/lib/store';

export default function CategoriesPage() {
  const { categories, language, addCategory, updateCategory, addToast } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [nameRu, setNameRu] = useState('');
  const save = () => {
    if (!name.trim()) return;
    addCategory({ name: name.trim(), nameRu: nameRu.trim() || name.trim(), isActive: true, order: categories.length + 1 });
    addToast({ type: 'success', title: language === 'uz' ? 'Kategoriya qo‘shildi' : 'Категория добавлена', message: '' });
    setName(''); setNameRu(''); setShowForm(false);
  };
  return <ModulePage title={language === 'uz' ? 'Kategoriyalar' : 'Категории'} action={language === 'uz' ? 'Yangi kategoriya' : 'Новая категория'} onAction={() => setShowForm(!showForm)}>
    {showForm && <div className="stat-card mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><input className="input-dark" value={name} onChange={event => setName(event.target.value)} placeholder="Nomi (UZ)"/><input className="input-dark" value={nameRu} onChange={event => setNameRu(event.target.value)} placeholder="Название (RU)"/><button className="btn-gold" onClick={save}>{language === 'uz' ? 'Saqlash' : 'Сохранить'}</button></div>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{categories.map(category => <article key={category.id} className="stat-card flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500/15 text-xl font-bold text-gold-400">{category.icon || category.name.charAt(0)}</div><div className="min-w-0 flex-1"><div className="font-semibold">{language === 'uz' ? category.name : category.nameRu}</div><div className="text-xs text-zinc-500">{category.isActive === false ? (language === 'uz' ? 'Nofaol' : 'Неактивна') : (language === 'uz' ? 'Faol' : 'Активна')}</div></div><button className={category.isActive === false ? 'btn-gold' : 'btn-secondary'} onClick={() => updateCategory(category.id, { isActive: category.isActive === false })}>{category.isActive === false ? (language === 'uz' ? 'Yoqish' : 'Включить') : (language === 'uz' ? 'O‘chirish' : 'Выключить')}</button></article>)}</div>
  </ModulePage>;
}
