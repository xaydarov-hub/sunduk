'use client';

import { useEffect, useState } from 'react';
import { Printer, Save } from 'lucide-react';
import { ModulePage } from '@/components/shared/ModulePage';
import { ReceiptModal } from '@/components/receipt/ReceiptModal';
import { Toggle } from '@/components/ui/Toggle';
import { useStore } from '@/lib/store';
import { ReceiptData, buildSampleReceipt } from '@/lib/receipt';
import { useT } from '@/lib/hooks';
import { Settings } from '@/types';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const PAPER = [58, 80, 88];

export default function SettingsPage() {
  const t = useT();
  const { settings, language, updateSettings, setLanguage, addToast } = useStore();
  const [draft, setDraft] = useState<Settings>(settings);
  const [sample, setSample] = useState<ReceiptData | null>(null);

  useEffect(() => setDraft(settings), [settings]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft(current => ({ ...current, [key]: value }));
  const toggleHour = (hour: number) => {
    const has = draft.durationOptions.includes(hour);
    if (has && draft.durationOptions.length === 1) return;
    set('durationOptions', (has ? draft.durationOptions.filter(h => h !== hour) : [...draft.durationOptions, hour]).sort((a, b) => a - b));
  };

  const save = async () => {
    await updateSettings(draft);
    setLanguage(draft.defaultLanguage);
    addToast({ title: t('Saqlandi', 'Сохранено'), message: t('Sozlamalar yangilandi', 'Настройки обновлены'), type: 'success' });
  };

  const testPrint = () => setSample(buildSampleReceipt(draft, language));

  return (
    <ModulePage title={t('Sozlamalar', 'Настройки')} extra={<button onClick={save} className="btn-gold flex items-center gap-2"><Save className="h-4 w-4" />{t('Saqlash', 'Сохранить')}</button>}>
      <section className="stat-card grid gap-4 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">{t('Korxona', 'Заведение')}</h2>
        {([
          ['businessName', t('Korxona nomi', 'Название заведения')],
          ['businessPhone', t('Telefon', 'Телефон')],
          ['businessAddress', t('Manzil', 'Адрес')],
          ['currencySymbol', t('Valyuta belgisi', 'Символ валюты')],
        ] as const).map(([key, label]) => (
          <label key={key} className="text-sm text-zinc-400">{label}<input value={draft[key]} onChange={event => set(key, event.target.value)} className="input-dark mt-1" /></label>
        ))}
        <label className="text-sm text-zinc-400">{t('QQS foizi (chekda “shu jumladan”)', 'НДС, % (в чеке «в т.ч.»)')}<input type="number" min="0" max="100" value={draft.taxRate} onChange={event => set('taxRate', Number(event.target.value))} className="input-dark mt-1" /></label>
        <label className="text-sm text-zinc-400">{t('Standart til', 'Язык по умолчанию')}
          <select value={draft.defaultLanguage} onChange={event => set('defaultLanguage', event.target.value as Settings['defaultLanguage'])} className="input-dark mt-1"><option value="uz">O‘zbekcha</option><option value="ru">Русский</option></select>
        </label>
      </section>

      <section className="stat-card space-y-4">
        <h2 className="font-semibold">{t('Xona vaqti va hisoblash', 'Время комнат и расчёт')}</h2>
        <div>
          <div className="mb-2 text-sm text-zinc-400">{t('Ofitsiant tanlaydigan soat variantlari', 'Варианты часов для официанта')}</div>
          <div className="flex flex-wrap gap-2">
            {HOURS.map(hour => (
              <button key={hour} type="button" onClick={() => toggleHour(hour)} className={`h-12 min-w-14 rounded-xl border-2 px-3 font-bold ${draft.durationOptions.includes(hour) ? 'border-gold-500 bg-gold-500 text-black' : 'border-white/10 text-zinc-400'}`}>{hour}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">{t('Xonaning soatlik narxi “Xonalar → Narxlar” bo‘limida belgilanadi.', 'Почасовая цена комнаты задаётся в «Комнаты → Тарифы».')}</p>
        </div>
        <Toggle checked={draft.overtimeBilling} onChange={value => set('overtimeBilling', value)} label={t('Vaqt oshib ketsa qo‘shimcha soat hisoblansin', 'Начислять доп. час при превышении времени')} hint={t('Belgilangan vaqtdan keyin har boshlangan soat uchun', 'За каждый начатый час после заданного времени')} />
        {draft.overtimeBilling && (
          <label className="block text-sm text-zinc-400 md:max-w-xs">{t('Bepul qo‘shimcha daqiqalar', 'Бесплатные минуты после окончания')}<input type="number" min="0" max="120" value={draft.overtimeGraceMinutes} onChange={event => set('overtimeGraceMinutes', Number(event.target.value))} className="input-dark mt-1" /></label>
        )}
        <label className="block text-sm text-zinc-400 md:max-w-xs">{t('Tozalash vaqti (daqiqa)', 'Время уборки (мин.)')}<input type="number" min="0" value={draft.cleaningDuration} onChange={event => set('cleaningDuration', Number(event.target.value))} className="input-dark mt-1" /></label>
      </section>

      <section className="stat-card space-y-4">
        <h2 className="font-semibold">{t('Chek va printer', 'Чек и принтер')}</h2>
        <div>
          <div className="mb-2 text-sm text-zinc-400">{t('Chek qog‘ozi kengligi', 'Ширина чековой ленты')}</div>
          <div className="flex gap-2">
            {PAPER.map(width => (
              <button key={width} type="button" onClick={() => set('paperWidthMm', width)} className={`h-12 min-w-24 rounded-xl border-2 px-4 font-bold ${draft.paperWidthMm === width ? 'border-gold-500 bg-gold-500 text-black' : 'border-white/10 text-zinc-400'}`}>{width} mm</button>
            ))}
          </div>
        </div>
        <Toggle checked={draft.showReceiptQr} onChange={value => set('showReceiptQr', value)} label={t('Chek pastida QR ko‘rsatilsin', 'Показывать QR внизу чека')} hint={t('Bu bezak QR — skanerlanmaydi, hech narsani tasdiqlamaydi', 'Это декоративный QR — не сканируется и ничего не подтверждает')} />
        <label className="block text-sm text-zinc-400">{t('Chek pastki matni (har qator alohida)', 'Текст внизу чека (каждая строка отдельно)')}
          <textarea rows={3} value={draft.receiptFooter} onChange={event => set('receiptFooter', event.target.value)} className="input-dark mt-1" />
        </label>
        <button type="button" onClick={testPrint} className="btn-secondary flex items-center gap-2"><Printer className="h-4 w-4" />{t('Sinov cheki', 'Пробный чек')}</button>
        <p className="text-xs text-zinc-500">
          {t('Maslahat: Chrome’ni “--kiosk-printing” bilan ishga tushirsangiz, chek bir tugma bilan darhol chiqadi. Printer sozlamalarida chekka (margin) = yo‘q, masshtab = 100% bo‘lsin.', 'Совет: запустите Chrome с «--kiosk-printing», и чек будет печататься по одной кнопке. В настройках принтера: поля — нет, масштаб — 100%.')}
        </p>
      </section>


      <ReceiptModal data={sample} onClose={() => setSample(null)} />
    </ModulePage>
  );
}
