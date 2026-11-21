'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePrintQueue } from '@/lib/printQueue';
import { printReceiptElement } from '@/lib/receipt';
import { useStore } from '@/lib/store';
import { TicketSheet } from '@/components/receipt/TicketSheet';

/**
 * Dialogsiz chop etish navbati. Navbatdagi talonchani ekrandan tashqarida chizadi va chop etadi.
 * Doimiy ulangan printerda (Chrome --kiosk-printing) hech qanday oynasiz, ketma-ket chiqadi.
 */
export function PrintHost() {
  const job = usePrintQueue(state => state.current);
  const finish = usePrintQueue(state => state.finish);
  const settings = useStore(state => state.settings);
  const language = useStore(state => state.language);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', complete);
      document.body.classList.remove('printing-ticket');
      finish();
    };

    const start = async () => {
      // Chek oynasi ochiq bo'lsa, uning tugashini kutamiz (ikki varaq aralashib ketmasligi uchun)
      for (let i = 0; i < 40 && document.body.classList.contains('printing-receipt'); i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      await new Promise(resolve => setTimeout(resolve, 250)); // varaq chizilishi uchun
      if (cancelled || !rootRef.current) return;
      document.body.classList.add('printing-ticket');
      window.addEventListener('afterprint', complete);
      try {
        printReceiptElement(rootRef.current, settings.paperWidthMm);
      } catch (error) {
        console.error('[print]', error);
        complete();
        return;
      }
      window.setTimeout(complete, 12000); // afterprint kelmasa ham navbat to'xtab qolmasin
    };
    void start();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  if (!job || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={rootRef} className="ticket-print-root" aria-hidden="true">
      <TicketSheet order={job.order} paperWidthMm={settings.paperWidthMm} business={settings.businessName} lang={language} test={job.test} />
    </div>,
    document.body,
  );
}
