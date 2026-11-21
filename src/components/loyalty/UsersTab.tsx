'use client';

import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';
import { downloadCsv } from '@/lib/csv';
import { formatCurrency } from '@/lib/utils';
import { loyaltyCall } from '@/lib/loyalty/api';
import { LoyaltyTx, LoyaltyUser, tierByKey, DEFAULT_LOYALTY } from '@/lib/loyalty/shared';
import { useLoyaltyUsers, useUserTx } from '@/lib/loyalty/useLoyaltyData';
import { Badge } from '@/components/loyalty/ui';
import { Modal } from '@/components/ui/Modal';
import { MoneyInput } from '@/components/ui/MoneyInput';

type Filter = 'all' | 'balance' | 'new' | 'inactive' | 'blocked';
const DAY = 86400000;
const dateOf = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');

const txLabel: Record<string, [string, string]> = {
  earn: ['Cashback', 'Кэшбэк'], welcome: ['Xush kelibsiz', 'Приветствие'], referral: ['Taklif', 'Приглашение'], spin: ['O‘yin', 'Игра'],
  birthday: ['Tug‘ilgan kun', 'День рождения'], redeem: ['Ishlatildi', 'Потрачено'], refund: ['Qaytarildi', 'Возврат'], expire: ['Kuydi', 'Сгорело'], admin: ['Admin', 'Админ'],
};

export function UsersTab() {
  const t = useT();
  const language = useStore(state => state.language);
  const config = useStore(state => state.loyalty) ?? DEFAULT_LOYALTY;
  const { items: users, loading, error } = useLoyaltyUsers();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    return users
      .filter(u => !q || `${u.name} ${u.username || ''} ${u.phone || ''} ${u.id}`.toLowerCase().includes(q))
      .filter(u => {
        switch (filter) {
          case 'balance': return (u.balance || 0) > 0;
          case 'new': return now - Date.parse(u.createdAt) < 7 * DAY;
          case 'inactive': return (u.claims || 0) > 0 && !!u.lastClaimAt && now - Date.parse(u.lastClaimAt) > 30 * DAY;
          case 'blocked': return !!u.blocked || !!u.botBlocked;
          default: return true;
        }
      })
      .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
  }, [users, query, filter]);

  const exportCsv = () => downloadCsv(`mijozlar-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Ism', 'Username', 'Telefon', 'Daraja', 'Balans', 'Jami xarid', 'Tashriflar', 'Ro‘yxatdan o‘tgan', 'Oxirgi chek', 'Til', 'Holat'],
    ...list.map(u => [u.name, u.username || '', u.phone || '', tierByKey(config, u.tier).name, u.balance || 0, u.totalSpent || 0, u.claims || 0, dateOf(u.createdAt), dateOf(u.lastClaimAt), u.lang, u.blocked ? 'bloklangan' : u.botBlocked ? 'botni bloklagan' : 'faol']),
  ]);

  const filters: Array<[Filter, string]> = [['all', t('Hammasi', 'Все')], ['balance', t('Balansi bor', 'С балансом')], ['new', t('Yangi (7 kun)', 'Новые (7 дн.)')], ['inactive', t('30 kun kelmagan', 'Не были 30 дн.')], ['blocked', t('Bloklangan', 'Заблокированные')]];
  const opened = users.find(u => u.id === openId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm"><Search className="absolute left-3 top-3 h-5 w-5 text-zinc-500" /><input className="input-dark pl-10" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Ism, telefon yoki @username', 'Имя, телефон или @username')} /></div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === key ? 'bg-gold-500 text-black' : 'bg-white/5 text-zinc-300'}`}>{label}</button>)}
        </div>
        <button type="button" onClick={exportCsv} disabled={!list.length} className="btn-secondary ml-auto flex items-center gap-2 text-sm"><Download className="h-4 w-4" />Excel (CSV)</button>
      </div>

      {error && <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      <div className="stat-card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>{t('Mijoz', 'Клиент')}</th><th>{t('Telefon', 'Телефон')}</th><th>{t('Daraja', 'Уровень')}</th><th>{t('Balans', 'Баланс')}</th><th>{t('Jami xarid', 'Всего покупок')}</th><th>{t('Tashrif', 'Визитов')}</th><th>{t('Oxirgi chek', 'Последний чек')}</th></tr></thead>
          <tbody>
            {list.map(user => (
              <tr key={user.id} className="cursor-pointer hover:bg-white/[.03]" onClick={() => setOpenId(user.id)}>
                <td><div className="font-medium">{user.name}</div><div className="text-xs text-zinc-500">{user.username ? `@${user.username}` : user.id} {user.blocked && <Badge tone="red">{t('blok', 'блок')}</Badge>} {user.botBlocked && <Badge tone="gray">{t('botni bloklagan', 'заблокировал бота')}</Badge>}</div></td>
                <td>{user.phone || '—'}</td>
                <td>{language === 'ru' ? tierByKey(config, user.tier).nameRu : tierByKey(config, user.tier).name}</td>
                <td className="font-semibold text-gold-400">{formatCurrency(user.balance || 0)}</td>
                <td>{formatCurrency(user.totalSpent || 0)}</td>
                <td>{user.claims || 0}</td>
                <td>{dateOf(user.lastClaimAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && list.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">{users.length ? t('Hech narsa topilmadi', 'Ничего не найдено') : t('Hali mijoz yo‘q. Chekdagi QR kodni skanerlagan mijozlar shu yerda paydo bo‘ladi.', 'Клиентов пока нет. Здесь появятся те, кто отсканирует QR на чеке.')}</p>}
        <p className="pt-3 text-xs text-zinc-600">{t('Jami', 'Всего')}: {users.length}</p>
      </div>

      <UserModal user={opened} onClose={() => setOpenId(null)} />
    </div>
  );
}

function UserModal({ user, onClose }: { user: LoyaltyUser | null; onClose: () => void }) {
  const t = useT();
  const language = useStore(state => state.language);
  const addToast = useStore(state => state.addToast);
  const config = useStore(state => state.loyalty) ?? DEFAULT_LOYALTY;
  const { items } = useUserTx(user?.id ?? null);
  const [amount, setAmount] = useState(0);
  const [sign, setSign] = useState<1 | -1>(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const txs = useMemo(() => [...items].sort((a: LoyaltyTx, b: LoyaltyTx) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30), [items]);

  const adjust = async () => {
    if (!user || !amount) return;
    setBusy(true);
    const res = await loyaltyCall('adjust', { userId: user.id, amount: sign * amount, note });
    setBusy(false);
    if (!res.ok) { addToast({ type: 'error', title: t('Bajarilmadi', 'Не выполнено'), message: res.error }); return; }
    addToast({ type: 'success', title: t('Balans yangilandi', 'Баланс обновлён'), message: '' });
    setAmount(0); setNote('');
  };

  const block = async (blocked: boolean) => {
    if (!user) return;
    const res = await loyaltyCall('userUpdate', { userId: user.id, blocked });
    if (!res.ok) addToast({ type: 'error', title: t('Bajarilmadi', 'Не выполнено'), message: res.error });
  };

  return (
    <Modal open={!!user} onClose={onClose} size="lg" title={user?.name}>
      {user && (
        <div className="space-y-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div><span className="text-zinc-500">Telegram:</span> {user.username ? `@${user.username}` : '—'} · ID {user.id}</div>
            <div><span className="text-zinc-500">{t('Telefon', 'Телефон')}:</span> {user.phone || '—'}</div>
            <div><span className="text-zinc-500">{t('Daraja', 'Уровень')}:</span> {language === 'ru' ? tierByKey(config, user.tier).nameRu : tierByKey(config, user.tier).name}</div>
            <div><span className="text-zinc-500">{t('Balans', 'Баланс')}:</span> <b className="text-gold-400">{formatCurrency(user.balance || 0)}</b></div>
            <div><span className="text-zinc-500">{t('Jami xarid', 'Всего покупок')}:</span> {formatCurrency(user.totalSpent || 0)} · {user.claims || 0} {t('chek', 'чеков')}</div>
            <div><span className="text-zinc-500">{t('Ishlatgan', 'Потрачено')}:</span> {formatCurrency(user.totalRedeemed || 0)}</div>
            <div><span className="text-zinc-500">{t('Taklif qilgan', 'Приглашено')}:</span> {user.refCount || 0} · 🎰 {user.spinTickets || 0}</div>
            <div><span className="text-zinc-500">{t('Ro‘yxatdan o‘tgan', 'Регистрация')}:</span> {dateOf(user.createdAt)}{user.birthday ? ` · 🎂 ${user.birthday.split('-').reverse().join('.')}` : ''}</div>
          </div>

          <div className="rounded-xl bg-white/[.03] p-3">
            <div className="mb-2 text-sm font-medium">{t('Balansni tuzatish', 'Корректировка баланса')}</div>
            <div className="flex flex-wrap gap-2">
              <div className="flex overflow-hidden rounded-lg border border-white/10">
                <button type="button" onClick={() => setSign(1)} className={`px-3 text-lg ${sign === 1 ? 'bg-green-500/30' : ''}`}>+</button>
                <button type="button" onClick={() => setSign(-1)} className={`px-3 text-lg ${sign === -1 ? 'bg-red-500/30' : ''}`}>−</button>
              </div>
              <div className="min-w-40 flex-1"><MoneyInput value={amount} onChange={setAmount} placeholder="0" /></div>
              <input className="input-dark min-w-40 flex-[2]" value={note} onChange={event => setNote(event.target.value)} placeholder={t('Izoh (mijozga ko‘rinadi)', 'Комментарий (увидит клиент)')} />
              <button type="button" className="btn-gold" disabled={busy || !amount} onClick={adjust}>{t('Qo‘llash', 'Применить')}</button>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">{t('So‘nggi harakatlar', 'Последние операции')}</div>
            <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
              {txs.map(tx => (
                <div key={tx.id} className="flex items-center justify-between rounded-lg bg-white/[.03] px-3 py-2">
                  <span><span className="text-zinc-500">{dateOf(tx.createdAt)}</span> · {txLabel[tx.type]?.[language === 'ru' ? 1 : 0] ?? tx.type}{tx.receiptNumber ? ` (${tx.receiptNumber})` : ''}{tx.note ? <span className="text-zinc-500"> — {tx.note}</span> : null}</span>
                  <b className={tx.amount >= 0 ? 'text-green-400' : 'text-red-400'}>{tx.amount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(tx.amount))}</b>
                </div>
              ))}
              {!txs.length && <p className="py-4 text-center text-zinc-500">{t('Harakat yo‘q', 'Операций нет')}</p>}
            </div>
          </div>

          <div className="flex justify-end">
            {user.blocked
              ? <button type="button" className="btn-secondary" onClick={() => block(false)}>{t('Blokdan chiqarish', 'Разблокировать')}</button>
              : <button type="button" className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10" onClick={() => block(true)}>{t('Bloklash', 'Заблокировать')}</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
