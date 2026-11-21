'use client';

import { ReceiptData } from '@/lib/receipt';
import { ReceiptSheet } from '@/components/receipt/ReceiptSheet';
import { PrintPreviewModal } from '@/components/receipt/PrintPreviewModal';
import { useT } from '@/lib/hooks';

interface ReceiptModalProps {
  data: ReceiptData | null;
  onClose: () => void;
  /** Chop etish bosilganda (jurnalga yozish uchun). */
  onPrint?: (data: ReceiptData) => void;
  /** Avtomatik chop etish (kassa printeri doimiy ulangan qurilma uchun). */
  autoPrint?: boolean;
}

export function ReceiptModal({ data, onClose, onPrint, autoPrint }: ReceiptModalProps) {
  const t = useT();
  return (
    <PrintPreviewModal
      open={!!data}
      title={data?.kind === 'receipt' ? t('Chek', 'Чек') : t('Hisob (shot)', 'Счёт')}
      paperWidthMm={data?.paperWidthMm ?? 88}
      onClose={onClose}
      onPrint={() => { if (data) onPrint?.(data); }}
      autoPrint={autoPrint}
      render={() => (data ? <ReceiptSheet data={data} /> : null)}
    />
  );
}
