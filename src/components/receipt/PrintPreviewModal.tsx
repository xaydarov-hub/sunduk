'use client';

import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Printer, X } from 'lucide-react';
import { printReceiptElement } from '@/lib/receipt';
import { useT } from '@/lib/hooks';

interface PrintPreviewModalProps {
  open: boolean;
  title: string;
  paperWidthMm: number;
  onClose: () => void;
  /** Chop etish bosilganda (jurnalga yozish uchun). */
  onPrint?: () => void;
  /** Oyna ochilishi bilan o'zi chop etadi va chop etilgach yopiladi (doimiy ulangan printer uchun). */
  autoPrint?: boolean;
  /** Varaqni chizadi: ekrandagi ko'rinish va chop etiladigan nusxa uchun ikki marta chaqiriladi. */
  render: () => ReactNode;
}

/**
 * Chek / hisobot ko'rinishi + chop etish. Ekrandagi ko'rinishdan tashqari, ekrandan tashqarida
 * (faqat chop etishda ko'rinadigan) ikkinchi nusxa render qilinadi.
 */
export function PrintPreviewModal({ open, title, paperWidthMm, onClose, onPrint, autoPrint, render }: PrintPreviewModalProps) {
  const t = useT();
  const printRef = useRef<HTMLDivElement>(null);
  const autoClosing = useRef(false);

  const print = useCallback((auto = false) => {
    if (!printRef.current) return;
    onPrint?.();
    if (auto) {
      autoClosing.current = true;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.removeEventListener('afterprint', finish);
        window.setTimeout(() => { autoClosing.current = false; onClose(); }, 700);
      };
      window.addEventListener('afterprint', finish);
      window.setTimeout(finish, 12000); // afterprint kelmasa ham oyna yopilsin
    }
    printReceiptElement(printRef.current, paperWidthMm);
  }, [onPrint, onClose, paperWidthMm]);

  // Avto-chop: oyna ochilishi bilan (varaq chizilishi uchun qisqa kutib)
  useEffect(() => {
    if (!open || !autoPrint) return;
    const id = window.setTimeout(() => print(true), 450);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoPrint]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('printing-receipt'); // chop etishda faqat varaq qoladi
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      document.body.classList.remove('printing-receipt');
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="no-print fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        <div className="relative flex max-h-[96vh] w-full flex-col rounded-t-2xl border border-white/10 bg-[#171717] shadow-2xl sm:max-w-md sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
            <h2 className="font-bold">{title} · {paperWidthMm} mm</h2>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-zinc-800 p-4">
            <div className="receipt-preview mx-auto w-fit shadow-xl">{render()}</div>
          </div>
          {autoPrint ? (
            <div className="flex items-center justify-center gap-2 border-t border-white/10 p-4 text-sm font-semibold text-green-400">
              <Check className="h-5 w-5" />{t('Printerga yuborilmoqda…', 'Отправляется на принтер…')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-4">
              <button type="button" onClick={onClose} className="btn-secondary min-h-12">{t('Yopish', 'Закрыть')}</button>
              <button type="button" autoFocus onClick={() => print(false)} className="btn-gold flex min-h-12 items-center justify-center gap-2">
                <Printer className="h-5 w-5" />{t('Chop etish', 'Печать')}
              </button>
            </div>
          )}
        </div>
      </div>
      <div ref={printRef} className="receipt-print-root" aria-hidden="true">{render()}</div>
    </>,
    document.body,
  );
}
