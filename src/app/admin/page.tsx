'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Banknote, BellRing, DoorOpen, ShoppingBag, TrendingUp } from 'lucide-react';
import { useStore } from '@/lib/store';
import { calculateCombinedBill } from '@/lib/calculations';
import { formatCurrency, generateDailyChartData, isLowStock, localDateKey } from '@/lib/utils';
import { roomStatusLabel, roomStatusTone } from '@/lib/labels';
import { useNow, useT } from '@/lib/hooks';
import { SessionClock } from '@/components/shared/SessionClock';

export default function AdminDashboard() {
  const t = useT();
  const { rooms, orders, payments, expenses, products, categories, language, sessions, settings } = useStore();
  const now = useNow(1000);
  const today = localDateKey();

  const todayRevenue = payments.filter(p => p.status !== 'cancelled' && localDateKey(p.createdAt) === today).reduce((sum, p) => sum + p.amount, 0);
  const todayExpenses = expenses.filter(e => e.date === today).reduce((sum, e) => sum + e.amount, 0);
  const chart = useMemo(() => generateDailyChartData(payments, 7), [payments]);
  const visibleRooms = rooms.filter(r => r.isActive !== false).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const occupied = visibleRooms.filter(r => r.status === 'occupied').length;
  const activeOrders = orders.filter(o => ['new', 'accepted', 'preparing', 'ready'].includes(o.status)).length;
  const lowStock = products.filter(p => p.isActive && isLowStock(p));
  const waitingPayment = sessions.filter(s => s.status === 'active' && calculateCombinedBill(s, orders, payments, settings, { at: now }).isOvertime).length;

  const cards = [
    { label: t('Bugungi tushum', 'Выручка сегодня'), value: formatCurrency(todayRevenue), icon: Banknote, color: 'text-gold-400' },
    { label: t('Band xonalar', 'Занятые комнаты'), value: `${occupied} / ${visibleRooms.length}`, icon: DoorOpen, color: 'text-blue-400' },
    { label: t('Faol buyurtmalar', 'Активные заказы'), value: String(activeOrders), icon: ShoppingBag, color: 'text-green-400' },
    { label: t('Bugungi xarajat', 'Расходы сегодня'), value: formatCurrency(todayExpenses), icon: TrendingUp, color: 'text-red-400' },
  ];

  return (
    <div className="page-container">
      <div className="section-header">
        <div>
          <h1 className="text-2xl font-bold">{t('Boshqaruv paneli', 'Панель управления')}</h1>
          <p className="text-sm text-zinc-500">{t('Bugungi operatsiyalar ko‘rinishi', 'Обзор операций за сегодня')}</p>
        </div>
      </div>

      {(categories.length === 0 || products.length === 0) && (
        <section className="stat-card !border-gold-500/40">
          <h2 className="font-semibold">{t('Boshlash uchun menyuni to‘ldiring', 'Для начала заполните меню')}</h2>
          <ol className="mt-3 space-y-2 text-sm text-zinc-300">
            <li className="flex items-center gap-3"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${categories.length ? 'bg-green-500 text-black' : 'bg-white/10'}`}>{categories.length ? '✓' : '1'}</span><Link href="/admin/categories/" className="hover:text-gold-400 hover:underline">{t('Kategoriyalar qo‘shing (Ichimliklar, Taomlar…)', 'Добавьте категории (Напитки, Блюда…)')}</Link></li>
            <li className="flex items-center gap-3"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${products.length ? 'bg-green-500 text-black' : 'bg-white/10'}`}>{products.length ? '✓' : '2'}</span><Link href="/admin/products/" className="hover:text-gold-400 hover:underline">{t('Mahsulotlarni narxi bilan kiriting', 'Внесите товары с ценами')}</Link></li>
            <li className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold">3</span><Link href="/admin/rooms/" className="hover:text-gold-400 hover:underline">{t('Xonalar nomi va soatlik narxini tekshiring', 'Проверьте названия и почасовые цены комнат')}</Link></li>
          </ol>
        </section>
      )}

      {waitingPayment > 0 && (
        <Link href="/admin/rooms" className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200 hover:bg-red-500/15">
          <BellRing className="h-5 w-5 shrink-0" />
          <span><b>{waitingPayment}</b> {t('ta xonada belgilangan vaqt tugagan — hisob-kitob kerak', 'комнат(ы) с истёкшим временем — нужен расчёт')}</span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between"><span className="text-sm text-zinc-400">{card.label}</span><card.icon className={`h-5 w-5 ${card.color}`} /></div>
            <div className="mt-4 text-2xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      <section className="stat-card">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{t('Xonalar', 'Комнаты')}</h2><Link href="/admin/rooms" className="text-sm text-gold-400 hover:underline">{t('Boshqarish', 'Управление')} →</Link></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleRooms.map(room => {
            const session = sessions.find(s => s.roomId === room.id && s.status === 'active');
            const tone = roomStatusTone[room.status];
            return (
              <div key={room.id} className={`rounded-xl border-2 bg-white/[.025] p-4 ${tone.ring}`}>
                <div className="flex items-center justify-between"><span className="font-semibold">{room.number}</span><span className={`status-badge ${tone.badge}`}>{roomStatusLabel(room.status, language)}</span></div>
                <div className="mt-2 text-xs text-zinc-500">{session?.customerName || room.name}</div>
                {session && <div className="mt-3"><SessionClock session={session} size="sm" /></div>}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="stat-card min-h-80">
          <h2 className="mb-6 font-semibold">{t('Haftalik tushum', 'Выручка за неделю')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v: number) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip contentStyle={{ background: '#1c1c1c', border: '1px solid #333' }} formatter={(v: number) => [formatCurrency(v), t('Tushum', 'Выручка')]} />
                <Area type="monotone" dataKey="amount" stroke="#f59e0b" fill="url(#gold)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="stat-card">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-amber-400" />{t('Ombor ogohlantirishlari', 'Остатки на складе')}</div>
          <div className="mt-4 space-y-3">
            {lowStock.slice(0, 6).map(p => (
              <div key={p.id} className="flex justify-between rounded-lg bg-white/[.03] p-3 text-sm"><span>{language === 'uz' ? p.name : p.nameRu}</span><span className="text-red-400">{p.currentStock} / {p.minStock}</span></div>
            ))}
            {!lowStock.length && <p className="text-sm text-zinc-500">{t('Ogohlantirish yo‘q', 'Предупреждений нет')}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
