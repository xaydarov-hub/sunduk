'use client';

import { ReceiptsList } from '@/components/shared/ReceiptsList';
import { useT } from '@/lib/hooks';

export default function ReceiptsPage() {
  const t = useT();
  return (
    <div className="page-container !p-3 sm:!p-6">
      <div>
        <h1 className="text-2xl font-bold">{t('Cheklar', 'Чеки')}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t('Qayta chop etilgan chek “NUSXA” belgisi bilan chiqadi', 'Повторно напечатанный чек помечается «КОПИЯ»')}</p>
      </div>
      <ReceiptsList />
    </div>
  );
}
