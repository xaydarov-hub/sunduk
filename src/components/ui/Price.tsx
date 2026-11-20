'use client';

import { useStore } from '@/lib/store';
import { formatNumber } from '@/lib/utils';

/** Narx: raqam katta, valyuta belgisi kichik — kartochkada bir qatorda qoladi. */
export function Price({ amount, className = '' }: { amount: number; className?: string }) {
  const symbol = useStore(state => state.settings.currencySymbol);
  return <span className={`whitespace-nowrap ${className}`}>{formatNumber(amount)} <span className="text-[0.62em] font-medium opacity-70">{symbol}</span></span>;
}
