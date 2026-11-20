'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { ReceiptData, printReceiptElement } from '@/lib/receipt';
import { ReceiptSheet } from '@/components/receipt/ReceiptSheet';
import { useT } from '@/lib/hooks';

interface ReceiptModalProps {
  data: ReceiptData | null;
  onClose: () => void;
  /** Chop etish bosilganda (jurnalga yozish uchun). */
  onPrint?: (data: ReceiptData) => void;
}

/**
 * Chek ko'rinishi + chop etish. Ekranda ko'rinadigan nusxa bilan bir qatorda
 * ekrandan tashqarida (faqat chop etishda ko'rinadigan) ikkinchi nusxa render qilinadi.
 */
export function ReceiptModal({ data, onClose, onPrint }: ReceiptModalProps) {
  const t = useT();
  const printRef = useRef<HTMLDivElement>(null);

  const print = () => {
    if (!data || !printRef.current) return;
    onPrint?.(data);
    printReceiptElement(printRef.current, data.paperWidthMm);
  };

  useEffect(() => {
    if (!data) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('printing-receipt'); // chop etishda faqat chek qoladi
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      document.body.classList.remove('printing-receipt');
    };
  }, [data, onClose]);

  if (!data || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="no-print fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        <div className="relative flex max-h-[96vh] w-full flex-col rounded-t-2xl border border-white/10 bg-[#171717] shadow-2xl sm:max-w-md sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <h2 className="font-bold">{data.kind === 'receipt' ? t('Chek', 'Чек') : t('Hisob (shot)', 'Счёт')} · {data.paperWidthMm} mm</h2>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-zinc-800 p-4">
            <div className="receipt-preview mx-auto w-fit shadow-xl"><ReceiptSheet data={data} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-4">
            <button type="button" onClick={onClose} className="btn-secondary min-h-12">{t('Yopish', 'Закрыть')}</button>
            <button type="button" autoFocus onClick={print} className="btn-gold flex min-h-12 items-center justify-center gap-2">
              <Printer className="h-5 w-5" />{t('Chop etish', 'Печать')}
            </button>
          </div>
        </div>
      </div>
      <div ref={printRef} className="receipt-print-root" aria-hidden="true"><ReceiptSheet data={data} /></div>
    </>,
    document.body,
  );
}
