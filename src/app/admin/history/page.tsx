'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ModulePage } from '@/components/shared/ModulePage';
import { useStore } from '@/lib/store';
import { formatDateTime } from '@/lib/utils';
import { roleLabel } from '@/lib/labels';
import { useT } from '@/lib/hooks';

const warnActions = ['order_cancelled', 'order_item_voided', 'session_cancelled', 'room_price_changed', 'discount_set', 'session_hours_changed'];

export default function HistoryPage() {
  const t = useT();
  const { activityLogs, language } = useStore();
  const [query, setQuery] = useState('');
  const [onlyImportant, setOnlyImportant] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activityLogs
      .filter(l => !onlyImportant || warnActions.includes(l.action))
      .filter(l => !q || `${l.action} ${l.details} ${l.userName}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [activityLogs, query, onlyImportant]);

  return (
    <ModulePage title={t('Faoliyat tarixi', 'История активности')} subtitle={t('Oxirgi 500 ta amal', 'Последние 500 действий')}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm"><Search className="absolute left-3 top-3 h-5 w-5 text-zinc-500" /><input className="input-dark pl-10" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Qidirish', 'Поиск')} /></div>
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" className="h-4 w-4 accent-amber-500" checked={onlyImportant} onChange={e => setOnlyImportant(e.target.checked)} />{t('Faqat bekor qilish va o‘zgartirishlar', 'Только отмены и изменения')}</label>
      </div>
      <div className="stat-card">
        {list.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">{t('Yozuvlar yo‘q', 'Записей нет')}</p>}
        {list.map(l => (
          <div key={l.id} className="border-b border-white/5 py-3 last:border-0">
            <div className="flex items-center gap-2"><span className={`font-medium ${warnActions.includes(l.action) ? 'text-red-300' : ''}`}>{l.action}</span></div>
            <div className="text-sm text-zinc-400">{l.details}</div>
            <div className="mt-1 text-xs text-zinc-600">{l.userName} ({roleLabel(l.userRole, language)}) · {formatDateTime(l.createdAt)}</div>
          </div>
        ))}
      </div>
    </ModulePage>
  );
}
