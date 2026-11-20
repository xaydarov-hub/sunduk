'use client';

import { InputHTMLAttributes } from 'react';
import { formatNumber } from '@/lib/utils';

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (value: number) => void;
}

/** Raqamli klaviatura va 1 250 000 ko'rinishidagi formatlash bilan summa kiritish maydoni. */
export function MoneyInput({ value, onChange, className = '', ...rest }: MoneyInputProps) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={`input-dark text-right font-semibold tabular-nums ${className}`}
      value={value > 0 ? formatNumber(value) : ''}
      onChange={event => onChange(parseInt(event.target.value.replace(/\D/g, ''), 10) || 0)}
      onFocus={event => event.target.select()}
    />
  );
}
