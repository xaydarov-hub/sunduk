'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, DoorOpen, Minus, Plus, Sparkles, Users } from 'lucide-react';
import { useStore } from '@/lib/store';
import { calculateCombinedBill } from '@/lib/calculations';
import { formatCurrency, formatTime } from '@/lib/utils';
import { roomStatusLabel, roomStatusTone } from '@/lib/labels';
import { useNow, useT } from '@/lib/hooks';
import { Modal } from '@/components/ui/Modal';
import { SessionClock } from '@/components/shared/SessionClock';
import { Room } from '@/types';

export default function WaiterRoomsPage() {
  const t = useT();
  const router = useRouter();
  const { rooms, sessions, orders, payments, settings, language, completeCleaning, addToast } = useStore();
  const now = useNow(1000);
  const [opening, setOpening] = useState<Room | null>(null);

  const visible = useMemo(
    () => rooms.filter(r => r.isActive !== false).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [rooms],
  );
  const count = (status: Room['status']) => visible.filter(r => r.status === status).length;

  const enter = (room: Room) => {
    if (room.status === 'available') setOpening(room);
    else if (room.status === 'occupied') router.push(`/waiter/room/${room.id}`);
  };

  return (
    <div className="page-container !space-y-4 !p-3 sm:!p-6">
      <div className="section-header !mb-0 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('Xonalar', 'Комнаты')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('Xonani tanlang: bo‘sh xona — vaqtni belgilang, band xona — buyurtma qo‘shing', 'Выберите комнату: свободную — задайте время, занятую — добавьте заказ')}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-green-400">{t('Bo‘sh', 'Свободно')}: {count('available')}</span>
          <span className="rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1.5 text-gold-400">{t('Band', 'Занято')}: {count('occupied')}</span>
          <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-purple-300">{t('Tozalanmoqda', 'Уборка')}: {count('cleaning')}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {visible.map(room => {
          const session = sessions.find(s => s.roomId === room.id && s.status === 'active');
          const tone = roomStatusTone[room.status];
          const bill = session ? calculateCombinedBill(session, orders, payments, settings, { at: now }) : null;
          const readyCount = session ? orders.filter(o => o.sessionId === session.id && o.status === 'ready').length : 0;
          const clickable = room.status === 'available' || room.status === 'occupied';

          return (
            <div
              key={room.id}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => clickable && enter(room)}
              onKeyDown={event => { if (clickable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); enter(room); } }}
              className={`relative flex min-h-48 flex-col rounded-2xl border-2 bg-graphite-800 p-4 transition-all ${tone.ring} ${clickable ? 'cursor-pointer hover:-translate-y-0.5 hover:bg-graphite-700 active:scale-[.98]' : ''} ${room.status === 'reserved' || room.status === 'maintenance' ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                <div className="flex items-center gap-2 whitespace-nowrap text-xl font-bold"><DoorOpen className="h-5 w-5 shrink-0 text-gold-400" />{room.number}</div>
                <span className={`status-badge whitespace-nowrap ${tone.badge}`}>{roomStatusLabel(room.status, language)}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">{room.name}</div>

              {room.status === 'available' && (
                <div className="mt-auto pt-4">
                  <div className="text-2xl font-bold text-gold-400">{formatCurrency(room.hourlyPrice)}</div>
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>/ {t('soat', 'час')}</span>
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{room.capacity}</span>
                  </div>
                  <div className="mt-3 rounded-lg bg-green-500/15 py-2 text-center text-sm font-semibold text-green-400">{t('Ochish', 'Открыть')}</div>
                </div>
              )}

              {room.status === 'occupied' && session && bill && (
                <div className="mt-3 flex flex-1 flex-col">
                  <SessionClock session={session} size="md" />
                  <div className="mt-auto flex items-end justify-between pt-3">
                    <div>
                      <div className="text-xs text-zinc-500">{session.customerName || t('Hisob', 'Счёт')}</div>
                      <div className="text-lg font-bold text-gold-400">{formatCurrency(bill.total)}</div>
                    </div>
                    {readyCount > 0 && (
                      <span className="flex animate-pulse items-center gap-1 rounded-full bg-green-500 px-2.5 py-1 text-xs font-bold text-black"><Check className="h-3.5 w-3.5" />{readyCount} {t('tayyor', 'готово')}</span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-600">{t('Boshlandi', 'Начало')}: {formatTime(session.startTime)}</div>
                </div>
              )}

              {room.status === 'cleaning' && (
                <div className="mt-auto pt-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-purple-300"><Sparkles className="h-4 w-4" />{t('Tozalash kerak', 'Нужна уборка')}</div>
                  <button
                    type="button"
                    onClick={event => { event.stopPropagation(); completeCleaning(room.id); addToast({ type: 'success', title: `${room.number} ${t('tozalandi', 'убрана')}`, message: '' }); }}
                    className="btn-secondary min-h-12 w-full"
                  >{t('TOZALANDI', 'УБОРКА ГОТОВА')}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visible.length === 0 && <div className="stat-card empty-state text-sm text-zinc-500">{t('Xonalar yo‘q. Admin xona qo‘shishi kerak.', 'Комнат нет. Администратор должен добавить комнаты.')}</div>}

      <OpenRoomDialog room={opening} onClose={() => setOpening(null)} onOpened={roomId => router.push(`/waiter/room/?id=${roomId}`)} />
    </div>
  );
}

function OpenRoomDialog({ room, onClose, onOpened }: { room: Room | null; onClose: () => void; onOpened: (roomId: string) => void }) {
  const t = useT();
  const { settings, openRoom, addToast } = useStore();
  const options = settings.durationOptions.length ? settings.durationOptions : [1, 2, 3];
  const [hours, setHours] = useState(options[0]);
  const [customer, setCustomer] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useNow(30000);

  // Har safar yangi xona ochilganda boshlang'ich qiymatlarga qaytamiz
  const [lastRoom, setLastRoom] = useState<string | null>(null);
  if (room && room.id !== lastRoom) { setLastRoom(room.id); setHours(options[0]); setCustomer(''); }
  if (!room && lastRoom) setLastRoom(null);

  if (!room) return <Modal open={false} onClose={onClose}>{null}</Modal>;

  const total = hours * room.hourlyPrice;
  const end = new Date(now + hours * 3600000);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    const result = await openRoom({ roomId: room.id, hours, customerName: customer });
    setBusy(false);
    if (!result.ok) { addToast({ type: 'error', title: t('Xona ochilmadi', 'Комната не открыта'), message: result.error }); return; }
    addToast({ type: 'success', title: `${room.number} ${t('ochildi', 'открыта')}`, message: `${hours} ${t('soat', 'ч')} · ${formatCurrency(total)}` });
    onClose();
    onOpened(room.id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={<span>{room.number} <span className="text-sm font-normal text-zinc-500">— {room.name}</span></span>}
      footer={<button type="button" onClick={start} disabled={busy} className="btn-gold min-h-14 w-full text-lg">{t('BOSHLASH', 'НАЧАТЬ')} · {formatCurrency(total)}</button>}
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-sm font-medium text-zinc-300">{t('Necha soatga?', 'На сколько часов?')}</div>
          <div className="grid grid-cols-3 gap-2">
            {options.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setHours(option)}
                className={`min-h-14 rounded-xl border-2 text-lg font-bold transition-all ${hours === option ? 'border-gold-500 bg-gold-500 text-black' : 'border-white/10 bg-white/5 hover:border-gold-500/40'}`}
              >
                {option} <span className="text-sm font-medium">{t('soat', 'ч')}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4">
            <button type="button" aria-label="-" disabled={hours <= 1} onClick={() => setHours(h => Math.max(1, h - 1))} className="btn-secondary h-12 w-12 p-0"><Minus className="mx-auto h-5 w-5" /></button>
            <div className="min-w-24 text-center text-3xl font-bold tabular-nums">{hours} <span className="text-base text-zinc-500">{t('soat', 'ч')}</span></div>
            <button type="button" aria-label="+" disabled={hours >= 24} onClick={() => setHours(h => Math.min(24, h + 1))} className="btn-secondary h-12 w-12 p-0"><Plus className="mx-auto h-5 w-5" /></button>
          </div>
        </div>

        <div className="space-y-2 rounded-xl bg-black/30 p-4 text-sm">
          <div className="flex justify-between"><span className="text-zinc-400">{t('Soatlik narx', 'Цена за час')}</span><b>{formatCurrency(room.hourlyPrice)}</b></div>
          <div className="flex justify-between"><span className="text-zinc-400">{t('Tugash vaqti', 'Окончание')}</span><b>{formatTime(end.toISOString())}</b></div>
          <div className="flex justify-between border-t border-white/10 pt-2 text-lg"><span>{t('Xona narxi', 'Стоимость комнаты')}</span><b className="text-gold-400">{formatCurrency(total)}</b></div>
        </div>

        <label className="block text-sm text-zinc-400">
          {t('Mijoz ismi (ixtiyoriy)', 'Имя гостя (необязательно)')}
          <input value={customer} onChange={event => setCustomer(event.target.value)} className="input-dark mt-1" placeholder={t('Masalan: Aziz', 'Например: Азиз')} />
        </label>
      </div>
    </Modal>
  );
}
