'use client';

import { PaymentPanel } from '@/components/shared/PaymentPanel';
import { useT } from '@/lib/hooks';

export default function PaymentsPage() {
  const t = useT();
  return (
    <div className="page-container !p-3 sm:!p-6">
      <div>
        <h1 className="text-2xl font-bold">{t('To‘lovlar', 'Платежи')}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t('Xonani tanlang, to‘lovni qabul qiling va chek chiqaring', 'Выберите комнату, примите оплату и распечатайте чек')}</p>
      </div>
      <PaymentPanel />
    </div>
  );
}
