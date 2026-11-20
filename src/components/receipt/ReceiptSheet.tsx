'use client';

import { ReactNode } from 'react';
import { ReceiptData } from '@/lib/receipt';
import { FakeQr } from '@/components/receipt/FakeQr';
import { formatDate, formatDateTime, formatNumber, formatTime } from '@/lib/utils';
import { paymentMethodLabel } from '@/lib/labels';

const text = {
  uz: {
    bill: 'HISOB (SHOT)', receipt: 'TO‘LOV CHEKI', copy: 'NUSXA',
    number: 'Chek №', date: 'Sana', room: 'Xona', customer: 'Mijoz', waiter: 'Ofitsiant', cashier: 'Kassir',
    roomSection: 'XONA IJARASI', start: 'Boshlandi', end: 'Tugadi', now: 'Hozir',
    hours: 'soat', extra: 'Qo‘shimcha vaqt', items: 'BUYURTMALAR',
    subtotal: 'Oraliq jami', discount: 'Chegirma', total: 'JAMI', vat: 'shu jumladan QQS',
    paid: 'To‘langan', paidNow: 'To‘landi', change: 'Qaytim', remaining: 'Qoldiq', pay: 'To‘lov kassada qabul qilinadi',
    thanks: 'Rahmat!',
  },
  ru: {
    bill: 'СЧЁТ', receipt: 'ЧЕК ОПЛАТЫ', copy: 'КОПИЯ',
    number: 'Чек №', date: 'Дата', room: 'Комната', customer: 'Гость', waiter: 'Официант', cashier: 'Кассир',
    roomSection: 'АРЕНДА КОМНАТЫ', start: 'Начало', end: 'Конец', now: 'Сейчас',
    hours: 'ч.', extra: 'Доп. время', items: 'ЗАКАЗЫ',
    subtotal: 'Промежуточный итог', discount: 'Скидка', total: 'ИТОГО', vat: 'в т.ч. НДС',
    paid: 'Оплачено', paidNow: 'Оплата', change: 'Сдача', remaining: 'Остаток', pay: 'Оплата принимается на кассе',
    thanks: 'Спасибо!',
  },
} as const;

function Row({ left, right, bold, big }: { left: ReactNode; right?: ReactNode; bold?: boolean; big?: boolean }) {
  return (
    <div className={`r-row${bold ? ' r-bold' : ''}${big ? ' r-big' : ''}`}>
      <span>{left}</span>
      {right !== undefined && <span>{right}</span>}
    </div>
  );
}

const Sep = ({ solid }: { solid?: boolean }) => <div className={solid ? 'r-sep r-sep-solid' : 'r-sep'} />;

/**
 * 58/80/88 mm termo-printer uchun chek. Faqat qora-oq: kulrang va fon rang ishlatilmaydi.
 */
export function ReceiptSheet({ data }: { data: ReceiptData }) {
  const t = text[data.lang];
  const symbol = data.business.currencySymbol;
  const isReceipt = data.kind === 'receipt';
  const vat = data.taxRate > 0 ? Math.round((data.total * data.taxRate) / (100 + data.taxRate)) : 0;
  const footerLines = data.business.footer.split('\n').filter(line => line.trim());

  return (
    <div className={`receipt${data.paperWidthMm <= 58 ? ' receipt-narrow' : ''}`} style={{ width: `${data.paperWidthMm}mm` }}>
      <div className="r-center">
        <div className="r-name">{data.business.name}</div>
        {data.business.address && <div className="r-small">{data.business.address}</div>}
        {data.business.phone && <div className="r-small">{data.business.phone}</div>}
      </div>

      <Sep />
      <div className="r-center r-title">{isReceipt ? t.receipt : t.bill}</div>
      {data.copy && <div className="r-center r-bold">— {t.copy} —</div>}
      <Sep />

      {data.number && <Row left={t.number} right={data.number} bold />}
      <Row left={t.date} right={formatDateTime(data.printedAt)} />
      {data.room && <Row left={t.room} right={`${data.room.number}`} bold />}
      {data.room?.name && <div className="r-small r-right">{data.room.name}</div>}
      {data.customer && <Row left={t.customer} right={data.customer} />}
      {data.waiter && <Row left={t.waiter} right={data.waiter} />}
      {data.cashier && <Row left={t.cashier} right={data.cashier} />}

      {data.room && (
        <>
          <Sep />
          <div className="r-section">{t.roomSection}</div>
          <Row
            left={`${t.start}: ${formatTime(data.room.start)} (${formatDate(data.room.start)})`}
            right={undefined}
          />
          <Row left={`${t.end}: ${data.room.end ? formatTime(data.room.end) : `${t.now} ${formatTime(data.printedAt)}`}`} />
          <Row
            left={`${data.room.bookedHours} ${t.hours} × ${formatNumber(data.room.hourlyPrice)}`}
            right={formatNumber(data.room.bookedHours * data.room.hourlyPrice)}
            bold
          />
          {data.room.overtimeHours > 0 && (
            <Row
              left={`${t.extra}: ${data.room.overtimeHours} ${t.hours} × ${formatNumber(data.room.hourlyPrice)}`}
              right={formatNumber(data.room.overtimeHours * data.room.hourlyPrice)}
              bold
            />
          )}
        </>
      )}

      {data.lines.length > 0 && (
        <>
          <Sep />
          <div className="r-section">{t.items}</div>
          {data.lines.map((line, index) => (
            <div key={`${line.name}-${index}`} className="r-item">
              <div className="r-item-name">{line.name}</div>
              <Row left={`${line.quantity} × ${formatNumber(line.unitPrice)}`} right={formatNumber(line.total)} bold />
            </div>
          ))}
        </>
      )}

      <Sep />
      {(data.discount > 0 || data.room) && <Row left={t.subtotal} right={formatNumber(data.subtotal)} />}
      {data.discount > 0 && <Row left={t.discount} right={`-${formatNumber(data.discount)}`} />}
      <Sep solid />
      <Row left={t.total} right={`${formatNumber(data.total)} ${symbol}`} big />
      {vat > 0 && <Row left={`${t.vat} (${data.taxRate}%)`} right={formatNumber(vat)} />}

      {isReceipt && data.payments.length > 0 && (
        <>
          <Sep />
          {data.payments.map(payment => (
            <Row key={payment.method} left={`${t.paidNow}: ${paymentMethodLabel(payment.method, data.lang)}`} right={formatNumber(payment.amount)} bold />
          ))}
          {data.change !== undefined && data.change > 0 && <Row left={t.change} right={formatNumber(data.change)} />}
          {data.remaining > 0 && <Row left={t.remaining} right={formatNumber(data.remaining)} bold />}
        </>
      )}
      {!isReceipt && data.paid > 0 && (
        <>
          <Row left={t.paid} right={formatNumber(data.paid)} />
          <Row left={t.remaining} right={formatNumber(data.remaining)} bold />
        </>
      )}
      {!isReceipt && <div className="r-center r-small r-gap">{t.pay}</div>}

      <Sep />
      <div className="r-center">
        {footerLines.map(line => <div key={line} className="r-small">{line}</div>)}
        <div className="r-bold r-gap">{t.thanks}</div>
        {data.showQr && (
          <div className="r-qr">
            <FakeQr seed={data.qrSeed} sizeMm={Math.min(30, data.paperWidthMm - 24)} />
          </div>
        )}
      </div>
    </div>
  );
}
