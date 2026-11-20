'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, Search } from 'lucide-react';
import { fetchOrder, fetchSessionBundle, loadHistory, useStore } from '@/lib/store';
import { buildBarReceipt, buildSessionReceipt, ReceiptData } from '@/lib/receipt';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { paymentMethodLabel } from '@/lib/labels';
import { useT } from '@/lib/hooks';
import { ReceiptModal } from '@/components/receipt/ReceiptModal';
import { Payment } from '@/types';

interface ReceiptGroup {
  number: string;
  createdAt: string;
  payments: Payment[];
  total: number;
  sessionId?: string;
  orderId?: string;
  roomNumber?: string;
  customerName?: string;
}

/** To'lov cheklari ro'yxati: ko'rish va qayta chop etish (nusxa). */
export function ReceiptsList() {
  const t = useT();
  const { payments, settings, language, currentUser, logActivity, addToast } = useStore();
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => {
    setLoading(true);
    loadHistory(days).finally(() => setLoading(false));
  }, [days]);

  const groups = useMemo(() => {
    const map = new Map<string, ReceiptGroup>();
    payments.filter(p => p.status !== 'cancelled').forEach(payment => {
      const existing = map.get(payment.receiptNumber);
      if (existing) {
        existing.payments.push(payment);
        existing.total += payment.amount;
      } else {
        map.set(payment.receiptNumber, {
          number: payment.receiptNumber, createdAt: payment.createdAt, payments: [payment], total: payment.amount,
          sessionId: payment.sessionId, orderId: payment.orderId, roomNumber: payment.roomNumber, customerName: payment.customerName,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [payments]);

  const filtered = groups.filter(group => {
    const q = query.trim().toLowerCase();
    return !q || `${group.number} ${group.roomNumber || ''} ${group.customerName || ''}`.toLowerCase().includes(q);
  });

  const open = async (group: ReceiptGroup) => {
    setBusy(group.number);
    try {
      if (group.sessionId) {
        const bundle = await fetchSessionBundle(group.sessionId);
        if (!bundle) throw new Error('not found');
        setReceipt(buildSessionReceipt({ kind: 'receipt', session: bundle.session, orders: bundle.orders, payments: bundle.payments, settings, lang: language, receiptNumber: group.number, copy: true }));
      } else if (group.orderId) {
        const order = await fetchOrder(group.orderId);
        if (!order) throw new Error('not found');
        setReceipt(buildBarReceipt({ order, payment: group.payments[0], settings, lang: language, copy: true }));
      }
    } catch {
      addToast({ type: 'error', title: t('Chekni yuklab bo‘lmadi', 'Не удалось загрузить чек'), message: '' });
    } finally {
      setBusy(null);
    }
  };

  const logPrint = (data: ReceiptData) => {
    if (!currentUser) return;
    logActivity({ userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role, action: 'receipt_reprinted', details: `Chek ${data.number} qayta chop etildi`, entity: 'receipt', entityId: data.number });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 max-w-sm flex-1">
          <Search className="absolute left-3 top-3 h-5 w-5 text-zinc-500" />
          <input className="input-dark pl-10" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Chek raqami, xona yoki mijoz', 'Номер чека, комната или гость')} />
        </div>
        <div className="flex rounded-xl bg-white/5 p-1">
          {[7, 30, 90].map(value => (
            <button key={value} type="button" onClick={() => setDays(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${days === value ? 'bg-gold-500 text-black' : 'text-zinc-400'}`}>{value} {t('kun', 'дн.')}</button>
          ))}
        </div>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-gold-400" />}
      </div>
      <div className="space-y-2">
        {filtered.length === 0 && !loading && <div className="stat-card empty-state text-sm text-zinc-500">{t('Cheklar topilmadi', 'Чеки не найдены')}</div>}
        {filtered.map(group => (
          <article key={group.number} className="stat-card flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold">{group.number}
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-normal text-zinc-400">{group.roomNumber || t('Bar savdosi', 'Продажа в баре')}</span>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {formatDateTime(group.createdAt)} · {group.payments.map(p => `${paymentMethodLabel(p.method, language)} ${formatCurrency(p.amount)}`).join(' + ')}
              </div>
              {group.customerName && <div className="mt-0.5 text-xs text-zinc-400">{group.customerName}</div>}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-lg font-bold text-gold-400">{formatCurrency(group.total)}</div>
              <button type="button" disabled={busy === group.number} onClick={() => open(group)} className="btn-secondary flex items-center gap-2">
                {busy === group.number ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}{t('Chek', 'Чек')}
              </button>
            </div>
          </article>
        ))}
      </div>
      <ReceiptModal data={receipt} onClose={() => setReceipt(null)} onPrint={logPrint} />
    </div>
  );
}
