'use client';

import { useStore } from '@/lib/store';
import { formatNumber } from '@/lib/utils';

/** Mahsulot narxi: yangi (aksiya) narx katta, eski narx o'chirilib kichik ko'rsatiladi. */
export function ProductPrice({ product, className = '' }: { product: { salePrice: number; oldPrice?: number }; className?: string }) {
  const old = product.oldPrice && product.oldPrice > product.salePrice ? product.oldPrice : 0;
  return (
    <span className={`inline-flex flex-col leading-tight ${className}`}>
      <Price amount={product.salePrice} />
      {old > 0 && <span className="text-xs font-normal text-zinc-500 line-through">{formatNumber(old)}</span>}
    </span>
  );
}

/** Narx: raqam katta, valyuta belgisi kichik — kartochkada bir qatorda qoladi. */
export function Price({ amount, className = '' }: { amount: number; className?: string }) {
  const symbol = useStore(state => state.settings.currencySymbol);
  return <span className={`whitespace-nowrap ${className}`}>{formatNumber(amount)} <span className="text-[0.62em] font-medium opacity-70">{symbol}</span></span>;
}
