'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { DoorOpen, Eye, EyeOff, Save, Settings2, Users } from 'lucide-react';
import { ModulePage } from '@/components/shared/ModulePage';
import { RoomSessionDialog } from '@/components/admin/RoomSessionDialog';
import { SessionClock } from '@/components/shared/SessionClock';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Modal } from '@/components/ui/Modal';
import { useStore } from '@/lib/store';
import { calculateCombinedBill } from '@/lib/calculations';
import { formatCurrency } from '@/lib/utils';
import { roomStatusLabel, roomStatusTone } from '@/lib/labels';
import { useNow, useT } from '@/lib/hooks';
import { Room, RoomStatus } from '@/types';

interface RoomDraft { name: string; capacity: number; hourlyPrice: number }

export default function AdminRoomsPage() {
  const t = useT();
  const { rooms, sessions, orders, payments, settings, language, addRoom, updateRoom, completeCleaning, addToast } = useStore();
  const now = useNow(1000);
  const [tab, setTab] = useState<'live' | 'tariffs'>('live');
  const [manageId, setManageId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<RoomDraft>>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ number: '', name: '', capacity: 6, hourlyPrice: 0 });

  const sorted = useMemo(() => [...rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })), [rooms]);
  const report = async (promise: Promise<{ ok: boolean; error?: string }>, success: string) => {
    const result = await promise;
    addToast(result.ok ? { type: 'success', title: success, message: '' } : { type: 'error', title: t('Saqlanmadi', 'Не сохранено'), message: result.error || '' });
    return result;
  };

  const draftOf = (room: Room): RoomDraft => ({ name: room.name, capacity: room.capacity, hourlyPrice: room.hourlyPrice, ...drafts[room.id] });
  const isDirty = (room: Room) => {
    const d = drafts[room.id];
    return !!d && (d.name !== undefined && d.name !== room.name || d.capacity !== undefined && d.capacity !== room.capacity || d.hourlyPrice !== undefined && d.hourlyPrice !== room.hourlyPrice);
  };
  const patchDraft = (roomId: string, patch: Partial<RoomDraft>) => setDrafts(current => ({ ...current, [roomId]: { ...current[roomId], ...patch } }));
  const saveRoom = async (room: Room) => {
    const d = draftOf(room);
    if (!d.name.trim() || d.hourlyPrice <= 0 || d.capacity < 1) { addToast({ type: 'error', title: t('Nom, sig‘im va narxni to‘ldiring', 'Заполните название, вместимость и цену'), message: '' }); return; }
    const result = await report(updateRoom(room.id, { name: d.name.trim(), capacity: d.capacity, hourlyPrice: d.hourlyPrice }), t('Xona yangilandi', 'Комната обновлена'));
    if (result.ok) setDrafts(current => { const copy = { ...current }; delete copy[room.id]; return copy; });
  };

  const submitNew = async () => {
    const result = await report(addRoom({ number: form.number, name: form.name || form.number, capacity: form.capacity, hourlyPrice: form.hourlyPrice, status: 'available' }), t('Xona qo‘shildi', 'Комната добавлена'));
    if (result.ok) { setShowForm(false); setForm({ number: '', name: '', capacity: 6, hourlyPrice: 0 }); }
  };

  const hasActive = (roomId: string) => sessions.some(s => s.roomId === roomId && s.status === 'active');

  return (
    <ModulePage
      title={t('Xonalar', 'Комнаты')}
      subtitle={t('Jonli holat va soatlik narxlar', 'Живое состояние и почасовые тарифы')}
      action={t('Xona qo‘shish', 'Добавить комнату')}
      onAction={() => { setTab('tariffs'); setShowForm(true); }}
    >
      <div className="flex w-fit rounded-xl bg-white/5 p-1">
        {([['live', t('Jonli holat', 'Сейчас')], ['tariffs', t('Narxlar va sozlash', 'Тарифы и настройка')]] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-5 py-2.5 text-sm font-semibold ${tab === value ? 'bg-gold-500 text-black' : 'text-zinc-400'}`}>{label}</button>
        ))}
      </div>

      {tab === 'live' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {sorted.map(room => {
            const session = sessions.find(s => s.roomId === room.id && s.status === 'active');
            const tone = roomStatusTone[room.status];
            const bill = session ? calculateCombinedBill(session, orders, payments, settings, { at: now }) : null;
            return (
              <article key={room.id} className={`stat-card border-2 ${tone.ring} ${room.isActive === false ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-lg font-bold"><DoorOpen className="h-5 w-5 text-gold-400" />{room.number}</div>
                  <span className={`status-badge ${tone.badge}`}>{roomStatusLabel(room.status, language)}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">{room.name} · {formatCurrency(room.hourlyPrice)} / {t('soat', 'ч')}</div>
                {session && bill ? (
                  <div className="mt-3 space-y-3">
                    <SessionClock session={session} size="sm" />
                    <div className="flex items-end justify-between">
                      <div className="text-xs text-zinc-500">{session.customerName || '—'}<br />{session.waiterName}</div>
                      <div className="text-lg font-bold text-gold-400">{formatCurrency(bill.total)}</div>
                    </div>
                    <button type="button" onClick={() => setManageId(session.id)} className="btn-gold flex min-h-11 w-full items-center justify-center gap-2"><Settings2 className="h-4 w-4" />{t('Boshqarish', 'Управление')}</button>
                  </div>
                ) : room.status === 'cleaning' ? (
                  <button type="button" onClick={() => completeCleaning(room.id)} className="btn-secondary mt-4 min-h-11 w-full">{t('Tozalandi', 'Уборка завершена')}</button>
                ) : (
                  <div className="mt-4 rounded-lg bg-white/[.03] py-6 text-center text-sm text-zinc-500">{room.status === 'available' ? t('Ofitsiant ochishi mumkin', 'Официант может открыть') : roomStatusLabel(room.status, language)}</div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {tab === 'tariffs' && (
        <>
          <p className="text-sm text-zinc-500">
            {t('Soatlik narxni admin belgilaydi. Ofitsiant xonani ochganda soat sonini tanlaydi:', 'Почасовой тариф задаёт админ. Официант при открытии выбирает число часов:')}{' '}
            <b className="text-zinc-300">{settings.durationOptions.join(', ')} {t('soat', 'ч')}</b> — <Link href="/admin/settings" className="text-gold-400 hover:underline">{t('o‘zgartirish', 'изменить')}</Link>
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {sorted.map(room => {
              const d = draftOf(room);
              const locked = hasActive(room.id);
              return (
                <article key={room.id} className={`stat-card space-y-4 ${room.isActive === false ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-lg font-bold"><DoorOpen className="h-5 w-5 text-gold-400" />{room.number}</div>
                    <div className="flex items-center gap-2">
                      <select
                        className="rounded-lg bg-zinc-800 px-2 py-1.5 text-xs disabled:opacity-50"
                        value={room.status}
                        disabled={locked}
                        title={locked ? t('Faol sessiya bor', 'Есть активная сессия') : undefined}
                        onChange={event => report(updateRoom(room.id, { status: event.target.value as RoomStatus }), t('Holat o‘zgartirildi', 'Статус изменён'))}
                      >
                        {(['available', 'reserved', 'cleaning', 'maintenance', ...(locked ? ['occupied'] : [])] as RoomStatus[]).map(status => <option key={status} value={status}>{roomStatusLabel(status, language)}</option>)}
                      </select>
                      <button type="button" onClick={() => report(updateRoom(room.id, { isActive: room.isActive === false }), room.isActive === false ? t('Xona ko‘rsatildi', 'Комната показана') : t('Xona yashirildi', 'Комната скрыта'))} className="btn-ghost p-2" title={room.isActive === false ? t('Ofitsiantga ko‘rsatish', 'Показать официанту') : t('Ofitsiantdan yashirish', 'Скрыть от официанта')}>
                        {room.isActive === false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_96px] gap-3">
                    <label className="text-xs text-zinc-500">{t('Nomi', 'Название')}<input className="input-dark mt-1" value={d.name} onChange={event => patchDraft(room.id, { name: event.target.value })} /></label>
                    <label className="text-xs text-zinc-500"><Users className="mr-1 inline h-3 w-3" />{t('Sig‘im', 'Вмест.')}<input className="input-dark mt-1" type="number" min="1" value={d.capacity} onChange={event => patchDraft(room.id, { capacity: Number(event.target.value) })} /></label>
                  </div>

                  <label className="block text-xs text-zinc-500">
                    {t('1 soat narxi (so‘m)', 'Цена за 1 час (сум)')}
                    <MoneyInput className="mt-1 !text-lg" value={d.hourlyPrice} onChange={value => patchDraft(room.id, { hourlyPrice: value })} />
                  </label>

                  <div className="flex flex-wrap gap-1.5">
                    {settings.durationOptions.map(hours => (
                      <span key={hours} className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-zinc-300">{hours} {t('soat', 'ч')} = <b className="text-gold-400">{formatCurrency(hours * d.hourlyPrice)}</b></span>
                    ))}
                  </div>
                  {locked && <p className="text-xs text-zinc-500">{t('Ochiq sessiya eski narxda hisoblanadi — yangi narx keyingi ochilishdan boshlab amal qiladi.', 'Открытая сессия считается по старой цене — новая цена действует со следующего открытия.')}</p>}

                  <button type="button" disabled={!isDirty(room)} onClick={() => saveRoom(room)} className="btn-gold flex min-h-11 w-full items-center justify-center gap-2 disabled:opacity-40"><Save className="h-4 w-4" />{t('Saqlash', 'Сохранить')}</button>
                </article>
              );
            })}
          </div>
        </>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={t('Yangi xona', 'Новая комната')}
        footer={<button type="button" onClick={submitNew} className="btn-gold min-h-12 w-full">{t('Qo‘shish', 'Добавить')}</button>}
      >
        <div className="space-y-4">
          <label className="block text-sm text-zinc-400">{t('Raqami', 'Номер')}<input className="input-dark mt-1" value={form.number} onChange={event => setForm({ ...form, number: event.target.value })} placeholder="VIP 08" /></label>
          <label className="block text-sm text-zinc-400">{t('Nomi', 'Название')}<input className="input-dark mt-1" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label className="block text-sm text-zinc-400">{t('Sig‘im (kishi)', 'Вместимость (чел.)')}<input className="input-dark mt-1" type="number" min="1" value={form.capacity} onChange={event => setForm({ ...form, capacity: Number(event.target.value) })} /></label>
          <label className="block text-sm text-zinc-400">{t('1 soat narxi (so‘m)', 'Цена за 1 час (сум)')}<MoneyInput className="mt-1" value={form.hourlyPrice} onChange={value => setForm({ ...form, hourlyPrice: value })} /></label>
        </div>
      </Modal>

      <RoomSessionDialog sessionId={manageId} onClose={() => setManageId(null)} />
    </ModulePage>
  );
}
