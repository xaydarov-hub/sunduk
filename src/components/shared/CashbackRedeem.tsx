'use client';

import { useState } from 'react';
import { Gift, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useT } from '@/lib/hooks';
import { formatCurrency } from '@/lib/utils';
import { lookupCashback, RedeemInfo } from '@/lib/loyalty/api';
import { MoneyInput } from '@/components/ui/MoneyInput';

export interface CashbackApplied { code: string; amount: number; name: string; balance: number }

interface Props {
  /** Shu to'lovning (cashbacksiz) summasi — ruxsat etilgan foiz shundan hisoblanadi. */
  due: number;
  applied: CashbackApplied | null;
  onChange: (value: CashbackApplied | null) => void;
  disabled?: boolean;
}

/** Kassirda: mijoz botdan olgan 6 xonali kodni kiritadi → balans ko'rinadi → summa tanlanadi → to'lovga qo'shiladi. */
export function CashbackRedeem({ due, applied, onChange, disabled }: Props) {
  const t = useT();
  const loyalty = useStore(state => state.loyalty);
  const [code, setCode] = useState('');
  const [info, setInfo] = useState<RedeemInfo | null>(null);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!loyalty?.enabled) return null;

  const reset = () => { setCode(''); setInfo(null); setAmount(0); setError(''); };

  const check = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true); setError('');
    const res = await lookupCashback(code, due);
    setBusy(false);
    if (!res.ok) { setError(res.error); setInfo(null); return; }
    setInfo(res.info);
    setAmount(res.info.max >= loyalty.minRedeemAmount ? res.info.max : 0);
  };

  const apply = () => {
    if (!info || amount < loyalty.minRedeemAmount || amount > info.max) return;
    onChange({ code: info.code, amount, name: info.name, balance: info.balance });
    reset();
  };

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 text-green-300"><Gift className="h-4 w-4 shrink-0" />{t('Cashback', 'Кэшбэк')}: <b>{applied.name}</b> · −{formatCurrency(applied.amount)}</span>
        <button type="button" disabled={disabled} onClick={() => onChange(null)} className="rounded p-1 text-zinc-400 hover:bg-white/10" aria-label={t('Bekor qilish', 'Отменить')}><X className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300"><Gift className="h-4 w-4 text-gold-400" />{t('Cashback bilan to‘lash', 'Оплата кэшбэком')}</div>
      <div className="flex gap-2">
        <input
          className="input-dark tracking-[0.3em]" inputMode="numeric" maxLength={6} value={code} disabled={disabled}
          onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setInfo(null); setError(''); }}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void check(); } }}
          placeholder={t('Mijozning 6 xonali kodi', 'Код клиента (6 цифр)')}
        />
        <button type="button" onClick={check} disabled={code.length !== 6 || busy || disabled} className="btn-secondary shrink-0 px-4">{busy ? '…' : t('Tekshirish', 'Проверить')}</button>
      </div>
      {error && <div className="text-sm text-red-400">{error}</div>}
      {info && (
        <div className="space-y-2 rounded-lg bg-black/25 p-3 text-sm">
          <div className="flex justify-between"><b>{info.name}</b><span className="text-zinc-400">{info.phone}</span></div>
          <div className="flex justify-between"><span className="text-zinc-400">{t('Balans', 'Баланс')}</span><b className="text-gold-400">{formatCurrency(info.balance)}</b></div>
          <div className="flex justify-between"><span className="text-zinc-400">{t('Ko‘pi bilan', 'Максимум')} ({loyalty.maxRedeemPercent}%)</span><b>{formatCurrency(info.max)}</b></div>
          {info.max < loyalty.minRedeemAmount ? (
            <div className="text-amber-400">{t('Ishlatish uchun mablag‘ yetarli emas', 'Недостаточно средств для списания')}</div>
          ) : (
            <div className="flex gap-2">
              <MoneyInput value={amount} onChange={value => setAmount(Math.min(value, info.max))} placeholder="0" />
              <button type="button" onClick={apply} disabled={amount < loyalty.minRedeemAmount} className="btn-gold shrink-0 px-4">{t('Qo‘llash', 'Применить')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
