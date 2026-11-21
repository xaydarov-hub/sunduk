'use client';

import { useMemo, useState } from 'react';
import { ModulePage } from '@/components/shared/ModulePage';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';
import { formatCurrency } from '@/lib/utils';
import { nowMs } from '@/lib/clock';
import { useLoyaltyUsers, useRecentClaims } from '@/lib/loyalty/useLoyaltyData';
import { Stat, Tabs } from '@/components/loyalty/ui';
import { SetupCard } from '@/components/loyalty/SetupCard';
import { ConfigForm } from '@/components/loyalty/ConfigForm';
import { UsersTab } from '@/components/loyalty/UsersTab';
import { BroadcastTab } from '@/components/loyalty/BroadcastTab';
import { AdsTab } from '@/components/loyalty/AdsTab';

type Tab = 'overview' | 'users' | 'broadcast' | 'ads';
const DAY = 86400000;

export default function LoyaltyPage() {
  const t = useT();
  const loyalty = useStore(state => state.loyalty);
  const [tab, setTab] = useState<Tab>('overview');
  const { items: users } = useLoyaltyUsers();
  const since = useMemo(() => new Date(Math.floor(nowMs() / DAY) * DAY - 30 * DAY).toISOString(), []);
  const { items: claims } = useRecentClaims(since);

  const stats = useMemo(() => {
    const now = nowMs();
    const rated = claims.filter(c => c.rating);
    const amount = claims.reduce((s, c) => s + (c.amount || 0), 0);
    return {
      total: users.length,
      fresh: users.filter(u => now - Date.parse(u.createdAt) < 7 * DAY).length,
      liability: users.reduce((s, u) => s + (u.balance || 0), 0),
      repeat: users.filter(u => (u.claims || 0) >= 2).length,
      buyers: users.filter(u => (u.claims || 0) >= 1).length,
      claims: claims.length,
      amount,
      cashback: claims.reduce((s, c) => s + (c.cashback || 0), 0),
      avgReceipt: claims.length ? Math.round(amount / claims.length) : 0,
      rating: rated.length ? Math.round((rated.reduce((s, c) => s + (c.rating || 0), 0) / rated.length) * 10) / 10 : null,
    };
  }, [users, claims]);

  return (
    <ModulePage title={t('Sodiqlik (Telegram cashback)', 'Лояльность (Telegram-кэшбэк)')} subtitle={loyalty?.botUsername ? `@${loyalty.botUsername}` : t('Bot hali ulanmagan', 'Бот ещё не подключён')}>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: t('Umumiy va sozlamalar', 'Обзор и настройки') },
        { key: 'users', label: `${t('Mijozlar', 'Клиенты')} (${stats.total})` },
        { key: 'broadcast', label: t('Xabar yuborish', 'Рассылка') },
        { key: 'ads', label: t('Reklama', 'Реклама') },
      ]} />

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('Bot mijozlari', 'Клиенты бота')} value={stats.total} sub={`+${stats.fresh} ${t('so‘nggi 7 kunda', 'за 7 дней')}`} />
            <Stat label={t('Skanerlangan cheklar (30 kun)', 'Отсканировано чеков (30 дн.)')} value={stats.claims} sub={formatCurrency(stats.amount)} />
            <Stat label={t('Berilgan cashback (30 kun)', 'Выдано кэшбэка (30 дн.)')} value={formatCurrency(stats.cashback)} sub={stats.amount ? `${((stats.cashback / stats.amount) * 100).toFixed(1)}% ${t('xarid summasidan', 'от суммы покупок')}` : undefined} />
            <Stat label={t('Mijozlar balansi (majburiyat)', 'Баланс клиентов (обязательства)')} value={formatCurrency(stats.liability)} />
            <Stat label={t('Qaytib kelganlar', 'Вернувшиеся')} value={stats.buyers ? `${Math.round((stats.repeat / stats.buyers) * 100)}%` : '—'} sub={`${stats.repeat} / ${stats.buyers} ${t('xaridor', 'покупателей')}`} />
            <Stat label={t('O‘rtacha chek', 'Средний чек')} value={stats.avgReceipt ? formatCurrency(stats.avgReceipt) : '—'} />
            <Stat label={t('O‘rtacha baho', 'Средняя оценка')} value={stats.rating ? `${stats.rating} ⭐` : '—'} />
          </div>
          <SetupCard />
          <ConfigForm avgReceipt={stats.avgReceipt} />
        </div>
      )}
      {tab === 'users' && <UsersTab />}
      {tab === 'broadcast' && <BroadcastTab />}
      {tab === 'ads' && <AdsTab />}
    </ModulePage>
  );
}
