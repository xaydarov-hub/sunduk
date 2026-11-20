'use client';

import { useState } from 'react';
import { ModulePage } from '@/components/shared/ModulePage';
import { useStore } from '@/lib/store';
import { formatDate, localDateKey } from '@/lib/utils';
import { bookingStatusLabel } from '@/lib/labels';
import { useT } from '@/lib/hooks';

const tone: Record<string, string> = {
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  confirmed: 'border-green-500/30 bg-green-500/10 text-green-300',
  cancelled: 'border-red-500/30 bg-red-500/10 text-red-300',
  completed: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};

export default function BookingsPage() {
  const t = useT();
  const { bookings, rooms, language, currentUser, addBooking, updateBooking, addToast } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [roomId, setRoomId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const sortedBookings = [...bookings].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

  const submit = () => {
    if (!customerName.trim() || !customerPhone.trim() || !roomId || !date || !startTime || !currentUser) {
      addToast({ type: 'error', title: t('Barcha maydonlarni to‘ldiring', 'Заполните все поля'), message: '' });
      return;
    }
    const clash = bookings.some(b => b.roomId === roomId && b.date === date && b.status !== 'cancelled' && b.status !== 'completed' && b.startTime === startTime);
    if (clash) { addToast({ type: 'error', title: t('Bu vaqtda xona allaqachon band qilingan', 'Комната на это время уже забронирована'), message: '' }); return; }
    addBooking({ customerName: customerName.trim(), customerPhone: customerPhone.trim(), roomId, date, startTime, status: 'confirmed', createdBy: currentUser.id });
    addToast({ type: 'success', title: t('Bron qo‘shildi', 'Бронь добавлена'), message: '' });
    setCustomerName(''); setCustomerPhone(''); setRoomId(''); setDate(''); setStartTime(''); setShowForm(false);
  };

  return (
    <ModulePage title={t('Bronlar', 'Брони')} action={t('Bron qo‘shish', 'Добавить бронь')} onAction={() => setShowForm(!showForm)}>
      {showForm && (
        <div className="stat-card grid gap-3 md:grid-cols-3">
          <input className="input-dark" placeholder={t('Mijoz', 'Клиент')} value={customerName} onChange={e => setCustomerName(e.target.value)} />
          <input className="input-dark" placeholder="+998" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
          <select className="input-dark" value={roomId} onChange={e => setRoomId(e.target.value)}><option value="">{t('Xona', 'Комната')}</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.number} — {room.name}</option>)}</select>
          <input className="input-dark" type="date" min={localDateKey()} value={date} onChange={e => setDate(e.target.value)} />
          <input className="input-dark" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          <button onClick={submit} className="btn-gold">{t('Saqlash', 'Сохранить')}</button>
        </div>
      )}
      <div className="stat-card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>{t('Mijoz', 'Клиент')}</th><th>{t('Xona', 'Комната')}</th><th>{t('Sana / vaqt', 'Дата / время')}</th><th>{t('Holat', 'Статус')}</th><th /></tr></thead>
          <tbody>
            {sortedBookings.map(item => (
              <tr key={item.id}>
                <td><b>{item.customerName}</b><div className="text-xs text-zinc-500">{item.customerPhone}</div></td>
                <td>{rooms.find(room => room.id === item.roomId)?.number || '-'}</td>
                <td>{formatDate(item.date, language)} {item.startTime}</td>
                <td><span className={`status-badge ${tone[item.status]}`}>{bookingStatusLabel(item.status, language)}</span></td>
                <td>
                  <div className="flex justify-end gap-2">
                    {item.status === 'pending' && <button className="btn-gold !px-3 !py-1.5 text-xs" onClick={() => updateBooking(item.id, { status: 'confirmed' })}>{t('Tasdiqlash', 'Подтвердить')}</button>}
                    {(item.status === 'pending' || item.status === 'confirmed') && <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => updateBooking(item.id, { status: 'completed' })}>{t('Yakunlash', 'Завершить')}</button>}
                    {(item.status === 'pending' || item.status === 'confirmed') && <button className="btn-danger !px-3 !py-1.5 text-xs" onClick={() => updateBooking(item.id, { status: 'cancelled' })}>{t('Bekor qilish', 'Отменить')}</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedBookings.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">{t('Bronlar yo‘q', 'Броней нет')}</p>}
      </div>
    </ModulePage>
  );
}
