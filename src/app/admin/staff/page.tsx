'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { ModulePage } from '@/components/shared/ModulePage';
import { useStore } from '@/lib/store';
import { roleLabel } from '@/lib/labels';
import { useT } from '@/lib/hooks';
import { UserRole } from '@/types';

export default function StaffPage() {
  const t = useT();
  const { users, language, currentUser, addUser, updateUser, addToast } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('waiter');

  const submit = async () => {
    const result = await addUser({ name, username, phone: phone.trim() || undefined, role, password });
    if (!result.ok) { addToast({ type: 'error', title: t('Xodim qo‘shilmadi', 'Сотрудник не добавлен'), message: result.error }); return; }
    addToast({ type: 'success', title: t('Xodim qo‘shildi', 'Сотрудник добавлен'), message: name });
    setName(''); setUsername(''); setPhone(''); setPassword(''); setRole('waiter'); setShowForm(false);
  };


  return (
    <ModulePage title={t('Xodimlar', 'Сотрудники')} action={t('Xodim qo‘shish', 'Добавить сотрудника')} onAction={() => setShowForm(value => !value)}>
      {showForm && (
        <div className="stat-card grid gap-3 md:grid-cols-3">
          <input value={name} onChange={event => setName(event.target.value)} placeholder={t('Ism', 'Имя')} className="input-dark" />
          <input value={username} onChange={event => setUsername(event.target.value)} placeholder="Login" className="input-dark" autoCapitalize="none" />
          <input value={password} onChange={event => setPassword(event.target.value)} placeholder={t('Parol (kamida 4 belgi)', 'Пароль (мин. 4 символа)')} className="input-dark" />
          <input value={phone} onChange={event => setPhone(event.target.value)} placeholder="+998" className="input-dark" />
          <select value={role} onChange={event => setRole(event.target.value as UserRole)} className="input-dark">
            {(['waiter', 'bar', 'admin'] as UserRole[]).map(r => <option key={r} value={r}>{roleLabel(r, language)}</option>)}
          </select>
          <button onClick={submit} className="btn-gold">{t('Saqlash', 'Сохранить')}</button>
        </div>
      )}
      <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4 text-sm text-zinc-400">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold-400" />
        <p>{t('Xodim parolini o‘zi o‘zgartiradi (tepadagi kalit belgisi). Parol unutilsa — xodimni “Faolsizlantirish” qilib, yangi login bilan hisob oching.', 'Сотрудник меняет пароль сам (значок ключа вверху). Если пароль забыт — отключите сотрудника и создайте новую учётную запись с другим логином.')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {users.map(user => (
          <div key={user.id} className={`stat-card ${user.isActive ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{user.name}</div>
                <div className="mt-1 text-sm text-zinc-400">{user.username} · {roleLabel(user.role, language)}</div>
                {user.phone && <div className="mt-1 text-sm text-zinc-500">{user.phone}</div>}
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <button
                  onClick={() => updateUser(user.id, { isActive: !user.isActive })}
                  disabled={user.id === currentUser?.id}
                  title={user.id === currentUser?.id ? t('O‘zingizni o‘chira olmaysiz', 'Нельзя отключить себя') : undefined}
                  className={`${user.isActive ? 'btn-secondary' : 'btn-gold'} !px-3 !py-1.5 text-xs disabled:opacity-40`}
                >
                  {user.isActive ? t('Faolsizlantirish', 'Отключить') : t('Faollashtirish', 'Включить')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

    </ModulePage>
  );
}
