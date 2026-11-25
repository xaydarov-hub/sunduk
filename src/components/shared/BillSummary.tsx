'use client';

import { CombinedBill } from '@/lib/calculations';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';

/** Xona hisobi: xona ijarasi, qo'shimcha vaqt, taomlar, chegirma, jami, to'langan va qoldiq. */
export function BillSummary({ bill, showLines = true }: { bill: CombinedBill; showLines?: boolean }) {
  const t = useT();
  const language = useStore(state => state.language);
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{t('Xona ijarasi', 'Аренда комнаты')}</div>
          <div className="text-xs text-zinc-500">{bill.bookedHours} {t('soat', 'ч')} × {formatNumber(bill.hourlyPrice)}</div>
        </div>
        <b>{formatCurrency(bill.bookedHours * bill.hourlyPrice)}</b>
      </div>
      {bill.overtimeHours > 0 && (
        <div className="flex items-start justify-between gap-3 text-red-300">
          <div>
            <div className="font-medium">{t('Qo‘shimcha vaqt', 'Доп. время')}</div>
            <div className="text-xs opacity-80">{bill.overtimeHours} {t('soat', 'ч')} × {formatNumber(bill.hourlyPrice)}</div>
          </div>
          <b>{formatCurrency(bill.overtimeHours * bill.hourlyPrice)}</b>
        </div>
      )}
      {showLines && bill.lines.length > 0 && (
        <div className="space-y-1.5 rounded-lg bg-black/20 p-3">
          {bill.lines.map(line => (
            <div key={line.key} className="flex justify-between gap-3">
              <span className="min-w-0 text-zinc-300">
                {line.quantity} × {language === 'uz' ? line.name : line.nameRu}
                {line.custom && <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 align-middle text-[10px] font-bold text-gold-400">=</span>}
                {line.oldUnitPrice ? <span className="ml-2 text-xs text-zinc-500 line-through">{formatNumber(line.oldUnitPrice)}</span> : null}
              </span>
              <span className="shrink-0">{formatNumber(line.total)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between"><span className="text-zinc-400">{t('Taomlar va ichimliklar', 'Блюда и напитки')}</span><b>{formatCurrency(bill.barAmount)}</b></div>
      {bill.promoSavings > 0 && <div className="flex justify-between text-xs text-green-400/80"><span>{t('Aksiyadan tejaldi (jamiga kiritilgan)', 'Сэкономлено по акции (уже учтено)')}</span><b>{formatCurrency(bill.promoSavings)}</b></div>}
      {bill.discount > 0 && <div className="flex justify-between text-green-400"><span>{t('Chegirma', 'Скидка')}</span><b>-{formatCurrency(bill.discount)}</b></div>}
      {bill.service > 0 && <div className="flex justify-between"><span className="text-zinc-400">{t('Xizmat haqi', 'Обслуживание')} ({bill.serviceRate}%)</span><b>+{formatCurrency(bill.service)}</b></div>}
      <div className="flex items-center justify-between border-t border-white/10 pt-3 text-lg">
        <span className="font-semibold">{t('Jami', 'Итого')}</span>
        <b className="text-gold-400">{formatCurrency(bill.total)}</b>
      </div>
      {bill.totalPaid > 0 && (
        <>
          <div className="flex justify-between text-zinc-400"><span>{t('To‘langan', 'Оплачено')}</span><b>{formatCurrency(bill.totalPaid)}</b></div>
          <div className="flex justify-between"><span>{t('Qoldiq', 'Остаток')}</span><b className="text-gold-400">{formatCurrency(bill.remaining)}</b></div>
        </>
      )}
    </div>
  );
}
