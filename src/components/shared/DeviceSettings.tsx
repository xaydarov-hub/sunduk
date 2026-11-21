'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { ReceiptModal } from '@/components/receipt/ReceiptModal';
import { useDevicePrefs } from '@/lib/devicePrefs';
import { usePrintQueue } from '@/lib/printQueue';
import { buildSampleReceipt, ReceiptData } from '@/lib/receipt';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';
import { chime } from '@/lib/sound';
import { Order } from '@/types';

/** Shu qurilma uchun printer va signal sozlamalari (kassa kompyuteri). Boshqa qurilmalarga ta'sir qilmaydi. */
export function DeviceSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { settings, language } = useStore();
  const prefs = useDevicePrefs();
  const enqueue = usePrintQueue(state => state.enqueue);
  const [sample, setSample] = useState<ReceiptData | null>(null);

  const testTicket = () => {
    const now = new Date().toISOString();
    const order: Order = {
      id: 'test', orderNumber: 'ORD-TEST', source: 'room', roomNumber: 'VIP 01', waiterName: 'Ofitsiant', status: 'new', notes: 'Muzsiz, limon bilan',
      items: [
        { id: 'a', productId: 'x', productName: 'Namuna ichimlik', productNameRu: 'Тестовый напиток', quantity: 2, unitPrice: 0, totalPrice: 0 },
        { id: 'b', productId: 'y', productName: 'Namuna taom', productNameRu: 'Тестовое блюдо', quantity: 1, unitPrice: 0, totalPrice: 0 },
      ],
      totalAmount: 0, inventoryDeducted: false, createdAt: now, updatedAt: now,
    };
    enqueue({ kind: 'ticket', order, test: true });
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={t('Printer va signal (shu qurilma)', 'Принтер и сигналы (это устройство)')} size="md">
        <div className="space-y-3">
          <Toggle checked={prefs.autoPrintReceipt} onChange={value => prefs.update({ autoPrintReceipt: value })} label={t('Chekni o‘zi chop etsin', 'Печатать чек автоматически')} hint={t('To‘lovdan keyin chek oynasi ochilib, darhol printerga yuboriladi', 'После оплаты чек сразу отправляется на принтер')} />
          <Toggle checked={prefs.autoPrintTickets} onChange={value => prefs.update({ autoPrintTickets: value })} label={t('Yangi buyurtma talonchasini o‘zi chop etsin', 'Печатать талон нового заказа автоматически')} hint={t('Ofitsiant buyurtma qo‘shganda bar printerida talonchasi chiqadi (narxsiz)', 'При новом заказе на принтере бара печатается талон (без цен)')} />
          <Toggle checked={prefs.sound} onChange={value => { prefs.update({ sound: value }); if (value) chime(); }} label={t('Yangi buyurtmada ovozli signal', 'Звуковой сигнал при новом заказе')} />

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" className="btn-secondary flex min-h-12 items-center justify-center gap-2" onClick={() => setSample(buildSampleReceipt(settings, language))}><Printer className="h-4 w-4" />{t('Sinov cheki', 'Пробный чек')}</button>
            <button type="button" className="btn-secondary flex min-h-12 items-center justify-center gap-2" onClick={testTicket}><Printer className="h-4 w-4" />{t('Sinov talonchasi', 'Пробный талон')}</button>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs leading-relaxed text-zinc-400">
            <div className="mb-1 font-semibold text-zinc-200">{t('Printerda oynasiz (darhol) chiqishi uchun — bir marta sozlang', 'Чтобы печатало сразу, без окна — настройте один раз')}</div>
            <ol className="list-decimal space-y-1 pl-4">
              <li>{t('Chek printerini Windows’da “Asosiy printer” (Default) qiling.', 'Сделайте чековый принтер принтером «по умолчанию» в Windows.')}</li>
              <li>{t('Printer sozlamasida: qog‘oz 88 mm (yoki 80 mm), chekkalar — yo‘q, kesish — “har hujjatdan keyin”.', 'В настройках принтера: бумага 88 мм (или 80), поля — нет, обрезка — «после каждого документа».')}</li>
              <li>{t('Chrome yorlig‘i (Ярлык) “Ob’ekt” maydoniga oxiriga qo‘shing:', 'В ярлыке Chrome в поле «Объект» допишите в конец:')} <code className="rounded bg-black/40 px-1.5 py-0.5 text-gold-400">--kiosk-printing</code></li>
              <li>{t('Chrome’ni shu yorlig‘dan oching va saytni kassa sifatida kiring. “Sinov cheki”ni bosing — oynasiz chiqishi kerak.', 'Откройте Chrome через этот ярлык и войдите на сайт как касса. Нажмите «Пробный чек» — печать пройдёт без окна.')}</li>
            </ol>
            <div className="mt-2 text-zinc-500">{t('Brauzer sozlamalari faqat shu kompyuterda saqlanadi.', 'Эти настройки хранятся только на этом компьютере.')}</div>
          </div>
        </div>
      </Modal>
      <ReceiptModal data={sample} onClose={() => setSample(null)} />
    </>
  );
}
