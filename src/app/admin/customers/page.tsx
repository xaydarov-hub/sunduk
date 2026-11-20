'use client';
import { useState } from 'react';
import { ModulePage } from '@/components/shared/ModulePage';
import { useStore } from '@/lib/store';
import { formatCurrency } from '@/lib/utils';
export default function CustomersPage() {
  const { customers, language, addCustomer, addToast } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const submit = () => {
    if (!name || !phone) return;
    addCustomer({ name, phone, email: '', notes: '' });
    addToast({ type: 'success', title: language === 'uz' ? 'Mijoz qo‘shildi' : 'Клиент добавлен', message: '' });
    setName(''); setPhone(''); setShowForm(false);
  };
  return <ModulePage title={language === 'uz' ? 'Mijozlar' : 'Клиенты'} action={language === 'uz' ? 'Mijoz qo‘shish' : 'Добавить клиента'} onAction={() => setShowForm(!showForm)}>
    {showForm && <div className="stat-card mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><input className="input-dark" placeholder={language === 'uz' ? 'Ism' : 'Имя'} value={name} onChange={e => setName(e.target.value)} /><input className="input-dark" placeholder="+998" value={phone} onChange={e => setPhone(e.target.value)} /><button onClick={submit} className="btn-gold">{language === 'uz' ? 'Saqlash' : 'Сохранить'}</button></div>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{customers.map(c => <div key={c.id} className="stat-card"><div className="font-semibold">{c.name}</div><div className="mt-1 text-sm text-zinc-400">{c.phone}</div><div className="mt-4 flex justify-between text-sm"><span>{c.visitCount} {language === 'uz' ? 'tashrif' : 'визитов'}</span><span className="text-gold-400">{formatCurrency(c.totalSpent)}</span></div></div>)}</div>
  </ModulePage>;
}
