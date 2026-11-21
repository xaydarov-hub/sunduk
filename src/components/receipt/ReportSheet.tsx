'use client';

import { ReactNode } from 'react';
import { DailyReport } from '@/lib/report';
import { formatDate, formatDateTime, formatNumber } from '@/lib/utils';
import { paymentMethodLabel } from '@/lib/labels';

const text = {
  uz: {
    title: 'KASSA HISOBOTI', date: 'Sana', scope: 'Kassir', printed: 'Chop etildi',
    methods: 'TO‘LOV USULLARI', total: 'JAMI', receipts: 'ta chek',
    sources: 'MANBALAR', room: 'Xona ijarasi', items: 'Taom va ichimlik', discounts: 'Chegirmalar',
    split: 'TURLARI', roomPay: 'Xona to‘lovlari', barSales: 'Bar savdosi',
    cashiers: 'KASSIRLAR', open: 'OCHIQ XONALAR', unpaid: 'To‘lanmagan qoldiq', sign: 'Kassir imzosi',
  },
  ru: {
    title: 'КАССОВЫЙ ОТЧЁТ', date: 'Дата', scope: 'Кассир', printed: 'Напечатано',
    methods: 'СПОСОБЫ ОПЛАТЫ', total: 'ИТОГО', receipts: 'чек.',
    sources: 'ИСТОЧНИКИ', room: 'Аренда комнат', items: 'Блюда и напитки', discounts: 'Скидки',
    split: 'ПО ТИПАМ', roomPay: 'Оплаты комнат', barSales: 'Продажи бара',
    cashiers: 'КАССИРЫ', open: 'ОТКРЫТЫЕ КОМНАТЫ', unpaid: 'Неоплаченный остаток', sign: 'Подпись кассира',
  },
} as const;

function Row({ left, right, bold }: { left: ReactNode; right?: ReactNode; bold?: boolean }) {
  return (
    <div className={`r-row${bold ? ' r-bold' : ''}`}>
      <span>{left}</span>
      {right !== undefined && <span>{right}</span>}
    </div>
  );
}

const Sep = ({ solid }: { solid?: boolean }) => <div className={solid ? 'r-sep r-sep-solid' : 'r-sep'} />;

/** Kunlik kassa hisoboti — termo-printer (58/80/88 mm), qora-oq. */
export function ReportSheet({ report }: { report: DailyReport }) {
  const t = text[report.lang];
  const symbol = report.business.currencySymbol;
  return (
    <div className={`receipt${report.paperWidthMm <= 58 ? ' receipt-narrow' : ''}`} style={{ width: `${report.paperWidthMm}mm` }}>
      <div className="r-center">
        <div className="r-name">{report.business.name}</div>
      </div>
      <Sep />
      <div className="r-center r-title">{t.title}</div>
      <Sep />
      <Row left={t.date} right={formatDate(`${report.date}T12:00:00`)} bold />
      <Row left={t.scope} right={report.scopeLabel} />
      <Row left={t.printed} right={formatDateTime(report.printedAt)} />

      <Sep />
      <div className="r-section">{t.methods}</div>
      {report.byMethod.map(item => (
        <Row key={item.method} left={`${paymentMethodLabel(item.method, report.lang)} (${item.count})`} right={formatNumber(item.amount)} />
      ))}
      <Sep solid />
      <Row left={`${t.total} (${report.receipts} ${t.receipts})`} right={`${formatNumber(report.total)} ${symbol}`} bold />

      <Sep />
      <div className="r-section">{t.split}</div>
      <Row left={`${t.roomPay} (${report.roomPayments.count})`} right={formatNumber(report.roomPayments.amount)} />
      <Row left={`${t.barSales} (${report.barSales.count})`} right={formatNumber(report.barSales.amount)} />

      {report.showSources && (
        <>
          <Sep />
          <div className="r-section">{t.sources}</div>
          <Row left={t.room} right={formatNumber(report.roomRevenue)} />
          <Row left={t.items} right={formatNumber(report.itemsRevenue)} />
          {report.discounts > 0 && <Row left={t.discounts} right={`-${formatNumber(report.discounts)}`} />}
        </>
      )}

      {report.byCashier.length > 0 && (
        <>
          <Sep />
          <div className="r-section">{t.cashiers}</div>
          {report.byCashier.map(c => (
            <Row key={c.name} left={`${c.name} (${c.receipts} ${t.receipts})`} right={formatNumber(c.total)} />
          ))}
        </>
      )}

      {report.showSources && (
        <>
          <Sep />
          <div className="r-section">{t.open}: {report.openRooms}</div>
          <Row left={t.unpaid} right={formatNumber(report.openBalance)} bold />
        </>
      )}

      <Sep />
      <div className="r-gap">{t.sign}: ____________________</div>
    </div>
  );
}
