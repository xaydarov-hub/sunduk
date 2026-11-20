'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModulePage } from '@/components/shared/ModulePage';
import { loadHistory, useStore } from '@/lib/store';
import { formatCurrency, formatDateTime, generateDailyChartData, localDateKey } from '@/lib/utils';
import { paymentMethodLabel, PAYMENT_METHODS } from '@/lib/labels';
import { useT } from '@/lib/hooks';
import { nowMs } from '@/lib/clock';
import { downloadCsv } from '@/lib/csv';
import { Download } from 'lucide-react';

type Range = 'today' | '7' | '30' | '90';

export default function ReportsPage() {
  const t = useT();
  const { payments, expenses, orders, sessions, users, language } = useStore();
  const [range, setRange] = useState<Range>('7');

  useEffect(() => { void loadHistory(range === 'today' ? 1 : Number(range)); }, [range]);

  const report = useMemo(() => {
    const from = localDateKey(nowMs() - (range === 'today' ? 0 : Number(range) - 1) * 24 * 3600 * 1000);
    const inRange = (iso: string) => localDateKey(iso) >= from;

    const pays = payments.filter(p => p.status !== 'cancelled' && inRange(p.createdAt));
    const income = pays.reduce((sum, p) => sum + p.amount, 0);
    const spent = expenses.filter(e => e.date >= from).reduce((sum, e) => sum + e.amount, 0);
    const byMethod = PAYMENT_METHODS.map(method => ({ method, amount: pays.filter(p => p.method === method).reduce((sum, p) => sum + p.amount, 0) }));

    // Xona ijarasi va bar/taom ulushi (to'langan sessiyalar + bar savdosi)
    const paid = sessions.filter(s => s.status === 'paid' && s.finalBill && s.endTime && inRange(s.endTime));
    const roomRevenue = paid.reduce((sum, s) => sum + (s.finalBill?.roomAmount || 0), 0);
    const itemsRevenue = paid.reduce((sum, s) => sum + (s.finalBill?.barAmount || 0), 0) + pays.filter(p => p.type === 'bar').reduce((sum, p) => sum + p.amount, 0);

    // Top mahsulotlar
    const sold = new Map<string, { name: string; nameRu: string; quantity: number; amount: number }>();
    orders.filter(o => o.status !== 'cancelled' && inRange(o.createdAt)).forEach(order => {
      order.items.filter(i => !i.voided).forEach(item => {
        const current = sold.get(item.productId) || { name: item.productName, nameRu: item.productNameRu, quantity: 0, amount: 0 };
        current.quantity += item.quantity;
        current.amount += item.totalPrice;
        sold.set(item.productId, current);
      });
    });
    const top = Array.from(sold.values()).sort((a, b) => b.amount - a.amount).slice(0, 6);

    // Bekor qilishlar (audit)
    const cancelledOrders = orders.filter(o => o.status === 'cancelled' && inRange(o.cancelledAt || o.createdAt));
    const voidedItems = orders.flatMap(o => o.items.filter(i => i.voided && o.status !== 'cancelled' && inRange(i.voidedAt || o.createdAt)).map(i => ({ order: o, item: i })));
    const cancelledSessions = sessions.filter(s => s.status === 'cancelled' && inRange(s.cancelledAt || s.startTime));

    const days = range === 'today' ? 1 : Number(range);
    return { pays, income, spent, byMethod, roomRevenue, itemsRevenue, top, cancelledOrders, voidedItems, cancelledSessions, chart: generateDailyChartData(pays, days), count: pays.length };
  }, [payments, expenses, orders, sessions, range]);

  const exportCsv = () => {
    const rows: Array<Array<unknown>> = [[t('Sana', 'Дата'), t('Chek', 'Чек'), t('Xona / Bar', 'Комната / Бар'), t('Mijoz', 'Гость'), t('To‘lov usuli', 'Способ оплаты'), t('Summa', 'Сумма'), t('Kassir', 'Кассир')]];
    report.pays.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(p => rows.push([formatDateTime(p.createdAt), p.receiptNumber, p.roomNumber || 'Bar', p.customerName || '', paymentMethodLabel(p.method, language), p.amount, p.processedByName || '']));
    downloadCsv(`sunduk-tolovlar-${localDateKey()}.csv`, rows);
  };
  const nameOfUser = (id?: string) => users.find(u => u.id === id)?.name || '—';
  const ranges: Array<[Range, string]> = [['today', t('Bugun', 'Сегодня')], ['7', t('7 kun', '7 дней')], ['30', t('30 kun', '30 дней')], ['90', t('90 kun', '90 дней')]];
  const profit = report.income - report.spent;
  const cancelCount = report.cancelledOrders.length + report.voidedItems.length + report.cancelledSessions.length;

  return (
    <ModulePage
      title={t('Hisobotlar', 'Отчёты')}
      extra={
        <>
        <button type="button" onClick={exportCsv} className="btn-secondary flex items-center gap-2"><Download className="h-4 w-4" />{t('Excel (CSV)', 'Excel (CSV)')}</button>
        <div className="flex rounded-xl bg-white/5 p-1">
          {ranges.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setRange(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${range === value ? 'bg-gold-500 text-black' : 'text-zinc-400'}`}>{label}</button>
          ))}
        </div>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="stat-card"><p className="text-sm text-zinc-400">{t('Jami tushum', 'Выручка')}</p><p className="mt-3 text-2xl font-bold text-gold-400">{formatCurrency(report.income)}</p><p className="mt-1 text-xs text-zinc-500">{report.count} {t('ta to‘lov', 'платежей')}</p></div>
        <div className="stat-card"><p className="text-sm text-zinc-400">{t('Xarajatlar', 'Расходы')}</p><p className="mt-3 text-2xl font-bold text-red-400">{formatCurrency(report.spent)}</p></div>
        <div className="stat-card"><p className="text-sm text-zinc-400">{t('Taxminiy foyda', 'Прибыль (оценка)')}</p><p className={`mt-3 text-2xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(profit)}</p></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="stat-card">
          <h2 className="mb-4 font-semibold">{t('Kunlik tushum', 'Выручка по дням')}</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.chart}>
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v: number) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} contentStyle={{ background: '#1c1c1c', border: '1px solid #333' }} formatter={(v: number) => [formatCurrency(v), t('Tushum', 'Выручка')]} />
                <Bar dataKey="amount" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="stat-card space-y-3">
          <h2 className="font-semibold">{t('To‘lov usullari', 'Способы оплаты')}</h2>
          {report.byMethod.map(item => (
            <div key={item.method} className="flex justify-between rounded-lg bg-white/[.03] p-3 text-sm"><span>{paymentMethodLabel(item.method, language)}</span><b>{formatCurrency(item.amount)}</b></div>
          ))}
          <h2 className="pt-2 font-semibold">{t('Daromad manbalari', 'Источники дохода')}</h2>
          <div className="flex justify-between rounded-lg bg-white/[.03] p-3 text-sm"><span>{t('Xona ijarasi', 'Аренда комнат')}</span><b>{formatCurrency(report.roomRevenue)}</b></div>
          <div className="flex justify-between rounded-lg bg-white/[.03] p-3 text-sm"><span>{t('Taom va ichimliklar', 'Блюда и напитки')}</span><b>{formatCurrency(report.itemsRevenue)}</b></div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="stat-card">
          <h2 className="mb-3 font-semibold">{t('Eng ko‘p sotilganlar', 'Самые продаваемые')}</h2>
          {report.top.length === 0 && <p className="text-sm text-zinc-500">{t('Ma’lumot yo‘q', 'Нет данных')}</p>}
          {report.top.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 text-sm last:border-0">
              <span><b className="mr-2 text-gold-400">{index + 1}.</b>{language === 'uz' ? item.name : item.nameRu}</span>
              <span className="text-zinc-400">{item.quantity} {t('ta', 'шт.')} · <b className="text-zinc-200">{formatCurrency(item.amount)}</b></span>
            </div>
          ))}
        </section>

        <section className="stat-card">
          <h2 className="mb-3 font-semibold">{t('Bekor qilishlar (nazorat)', 'Отмены (контроль)')} <span className="text-sm font-normal text-zinc-500">{cancelCount}</span></h2>
          {cancelCount === 0 && <p className="text-sm text-zinc-500">{t('Bu davrda bekor qilish bo‘lmagan', 'За период отмен не было')}</p>}
          <div className="space-y-2 text-sm">
            {report.cancelledSessions.map(s => (
              <div key={s.id} className="rounded-lg bg-red-500/10 p-3"><b>{s.roomNumber}</b> — {t('sessiya bekor qilindi', 'сессия отменена')}<div className="text-xs text-zinc-400">{nameOfUser(s.cancelledBy)} · {s.cancelledAt ? formatDateTime(s.cancelledAt) : ''}{s.cancelReason ? ` · ${s.cancelReason}` : ''}</div></div>
            ))}
            {report.cancelledOrders.map(o => (
              <div key={o.id} className="rounded-lg bg-red-500/10 p-3"><b>{o.orderNumber}</b> ({o.roomNumber || 'Bar'}) — {formatCurrency(o.items.reduce((sum, i) => sum + i.totalPrice, 0))}<div className="text-xs text-zinc-400">{nameOfUser(o.cancelledBy)} · {o.cancelledAt ? formatDateTime(o.cancelledAt) : ''}{o.cancelReason ? ` · ${o.cancelReason}` : ''}</div></div>
            ))}
            {report.voidedItems.map(({ order, item }) => (
              <div key={item.id} className="rounded-lg bg-red-500/10 p-3"><b>{order.orderNumber}</b>: {item.quantity} × {language === 'uz' ? item.productName : item.productNameRu} — {formatCurrency(item.totalPrice)}<div className="text-xs text-zinc-400">{nameOfUser(item.voidedBy)} · {item.voidedAt ? formatDateTime(item.voidedAt) : ''}{item.voidReason ? ` · ${item.voidReason}` : ''}</div></div>
            ))}
          </div>
        </section>
      </div>
    </ModulePage>
  );
}
