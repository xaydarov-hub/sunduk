'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { loadHistory, useStore } from '@/lib/store';
import { buildDailyReport } from '@/lib/report';
import { downloadCsv } from '@/lib/csv';
import { formatCurrency, formatDateTime, localDateKey } from '@/lib/utils';
import { paymentMethodLabel } from '@/lib/labels';
import { nowMs } from '@/lib/clock';
import { useT } from '@/lib/hooks';
import { PrintPreviewModal } from '@/components/receipt/PrintPreviewModal';
import { ReportSheet } from '@/components/receipt/ReportSheet';

/** Kunlik kassa hisoboti: ekranda ko'rish, 88 mm printerga chiqarish, Excel (CSV). */
export default function BarReportPage() {
  const t = useT();
  const { payments, sessions, orders, settings, language, currentUser, logActivity } = useStore();
  const today = localDateKey(nowMs());
  const [date, setDate] = useState(today);
  const [mine, setMine] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const days = Math.max(1, Math.ceil((new Date(`${today}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86400000) + 1);
    setLoading(true);
    loadHistory(Math.min(days, 90)).finally(() => setLoading(false));
  }, [date, today]);

  const report = useMemo(
    () => buildDailyReport({ date, payments, sessions, orders, settings, lang: language, cashierId: mine ? currentUser?.id : undefined, cashierName: currentUser?.name }),
    [date, payments, sessions, orders, settings, language, mine, currentUser],
  );

  const exportCsv = () => {
    const rows: Array<Array<unknown>> = [[t('Vaqt', 'Время'), t('Chek', 'Чек'), t('Xona / Bar', 'Комната / Бар'), t('Mijoz', 'Гость'), t('Usul', 'Способ'), t('Summa', 'Сумма'), t('Kassir', 'Кассир')]];
    payments
      .filter(p => p.status !== 'cancelled' && localDateKey(p.createdAt) === date && (!mine || p.processedBy === currentUser?.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach(p => rows.push([formatDateTime(p.createdAt), p.receiptNumber, p.roomNumber || 'Bar', p.customerName || '', paymentMethodLabel(p.method, language), p.amount, p.processedByName || '']));
    downloadCsv(`kassa-${date}.csv`, rows);
  };

  const logPrint = () => {
    if (!currentUser) return;
    logActivity({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'report_printed', details: `Kassa hisoboti chop etildi: ${date}${mine ? ' (faqat o‘zimniki)' : ''}`, entity: 'report', entityId: date });
  };

  return (
    <div className="page-container !p-3 sm:!p-6">
      <div className="section-header flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('Kassa hisoboti', 'Кассовый отчёт')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('Smena oxirida chop etib, kassadagi pul bilan solishtiring', 'Распечатайте в конце смены и сверьте с деньгами в кассе')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input-dark !w-auto" value={date} max={today} onChange={event => setDate(event.target.value || today)} />
          <div className="flex rounded-xl bg-white/5 p-1">
            <button onClick={() => setMine(false)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${!mine ? 'bg-gold-500 text-black' : 'text-zinc-400'}`}>{t('Hammasi', 'Все')}</button>
            <button onClick={() => setMine(true)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mine ? 'bg-gold-500 text-black' : 'text-zinc-400'}`}>{t('Faqat men', 'Только я')}</button>
          </div>
          {loading && <Loader2 className="h-5 w-5 animate-spin text-gold-400" />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="stat-card"><div className="text-sm text-zinc-400">{t('Jami tushum', 'Выручка')}</div><div className="mt-2 text-2xl font-bold text-gold-400">{formatCurrency(report.total)}</div><div className="mt-1 text-xs text-zinc-500">{report.receipts} {t('ta chek', 'чеков')}</div></div>
        {report.byMethod.map(item => (
          <div key={item.method} className="stat-card"><div className="text-sm text-zinc-400">{paymentMethodLabel(item.method, language)}</div><div className="mt-2 text-2xl font-bold">{formatCurrency(item.amount)}</div><div className="mt-1 text-xs text-zinc-500">{item.count} {t('ta to‘lov', 'платежей')}</div></div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="stat-card space-y-2 text-sm">
          <h2 className="font-semibold">{t('Turlari', 'По типам')}</h2>
          <div className="flex justify-between"><span className="text-zinc-400">{t('Xona to‘lovlari', 'Оплаты комнат')} ({report.roomPayments.count})</span><b>{formatCurrency(report.roomPayments.amount)}</b></div>
          <div className="flex justify-between"><span className="text-zinc-400">{t('Bar savdosi', 'Продажи бара')} ({report.barSales.count})</span><b>{formatCurrency(report.barSales.amount)}</b></div>
          {report.showSources && (
            <>
              <div className="flex justify-between border-t border-white/10 pt-2"><span className="text-zinc-400">{t('Xona ijarasi', 'Аренда комнат')}</span><b>{formatCurrency(report.roomRevenue)}</b></div>
              <div className="flex justify-between"><span className="text-zinc-400">{t('Taom va ichimlik', 'Блюда и напитки')}</span><b>{formatCurrency(report.itemsRevenue)}</b></div>
              {report.discounts > 0 && <div className="flex justify-between text-green-400"><span>{t('Chegirmalar', 'Скидки')}</span><b>-{formatCurrency(report.discounts)}</b></div>}
              <div className="flex justify-between border-t border-white/10 pt-2"><span className="text-zinc-400">{t('Hozir ochiq xonalar', 'Открытые комнаты сейчас')} ({report.openRooms})</span><b className="text-amber-400">{formatCurrency(report.openBalance)}</b></div>
            </>
          )}
        </section>
        <section className="stat-card space-y-2 text-sm">
          <h2 className="font-semibold">{t('Kassirlar', 'Кассиры')}</h2>
          {report.byCashier.length === 0 && <p className="text-zinc-500">{t('Bu kunda to‘lov yo‘q', 'Платежей за этот день нет')}</p>}
          {report.byCashier.map(c => (
            <div key={c.name} className="flex justify-between"><span className="text-zinc-400">{c.name} ({c.receipts} {t('ta chek', 'чеков')})</span><b>{formatCurrency(c.total)}</b></div>
          ))}
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setOpen(true)} className="btn-gold flex min-h-12 items-center gap-2"><Printer className="h-5 w-5" />{t('Hisobotni chop etish (88 mm)', 'Печать отчёта (88 мм)')}</button>
        <button type="button" onClick={exportCsv} className="btn-secondary flex min-h-12 items-center gap-2"><Download className="h-5 w-5" />Excel (CSV)</button>
      </div>

      <PrintPreviewModal
        open={open}
        title={t('Kassa hisoboti', 'Кассовый отчёт')}
        paperWidthMm={settings.paperWidthMm}
        onClose={() => setOpen(false)}
        onPrint={logPrint}
        render={() => <ReportSheet report={report} />}
      />
    </div>
  );
}
