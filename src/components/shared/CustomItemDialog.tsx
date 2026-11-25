'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { useT } from '@/lib/hooks';
import { formatCurrency } from '@/lib/utils';

export interface CustomItemValue { name: string; price: number; quantity: number }

interface CustomItemDialogProps {
  open: boolean;
  onClose: () => void;
  /** true qaytarsa yoki xatosiz tugasa oyna yopiladi. */
  onSubmit: (item: CustomItemValue) => Promise<boolean | void> | boolean | void;
  title?: string;
}

/** "=" tugmasi: menyuda yo'q narsa (jarima, buzilgan buyum va h.k.) — nomi va narxini yozib hisobga qo'shish. */
export function CustomItemDialog({ open, onClose, onSubmit, title }: CustomItemDialogProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setName(''); setPrice(0); setQuantity(1); setBusy(false); }
  }, [open]);

  const presets = [t('Jarima', 'Штраф'), t('Buzilgan buyum', 'Порча имущества'), t('Xizmat', 'Услуга'), t('Boshqa', 'Другое')];
  const valid = name.trim().length > 0 && price > 0 && quantity >= 1;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const result = await onSubmit({ name: name.trim(), price, quantity });
      if (result !== false) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t('Menyudan tashqari qo‘shish', 'Добавить вне меню')}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="btn-secondary min-h-12">{t('Bekor qilish', 'Отмена')}</button>
          <button type="button" onClick={submit} disabled={!valid || busy} className="btn-gold min-h-12">{t('Qo‘shish', 'Добавить')}{valid ? ` · ${formatCurrency(price * quantity)}` : ''}</button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">{t('Menyuda yo‘q narsa: jarima, buzilgan buyum va h.k. Nima ekanligini yozing va narxini kiriting — chekda shunday chiqadi.', 'Позиция, которой нет в меню: штраф, порча и т.п. Напишите, что это, и укажите цену — в чеке будет так же.')}</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset, index) => (
            <button
              key={preset}
              type="button"
              onClick={() => setName(index === presets.length - 1 ? '' : preset)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${name === preset ? 'bg-gold-500 text-black' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="block text-sm text-zinc-400">
          {t('Nima ekanligi (chekda ko‘rinadi)', 'Что это (будет в чеке)')}
          <input
            className="input-dark mt-1"
            value={name}
            maxLength={60}
            autoFocus
            onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void submit(); } }}
            placeholder={t('Masalan: Jarima — buzilgan stakan', 'Например: Штраф — разбитый стакан')}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-zinc-400">
            {t('Narxi (bittasi)', 'Цена (за 1)')}
            <MoneyInput className="mt-1" value={price} onChange={setPrice} placeholder="0" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void submit(); } }} />
          </label>
          <div className="text-sm text-zinc-400">
            {t('Soni', 'Количество')}
            <div className="mt-1 flex items-center gap-2">
              <button type="button" aria-label="-" onClick={() => setQuantity(q => Math.max(1, q - 1))} className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10"><Minus className="h-4 w-4" /></button>
              <b className="w-10 text-center text-lg tabular-nums text-white">{quantity}</b>
              <button type="button" aria-label="+" onClick={() => setQuantity(q => Math.min(99, q + 1))} className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10"><Plus className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
