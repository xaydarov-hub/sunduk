// Kunlik kassa hisoboti (Z/X): to'lovlar usul bo'yicha, manbalar, kassirlar, ochiq xonalar.
import { Language, Order, Payment, PaymentMethod, RoomSession, Settings } from '@/types';
import { calculateCombinedBill } from '@/lib/calculations';
import { localDateKey } from '@/lib/utils';
import { nowIso } from '@/lib/clock';

export interface DailyReport {
  date: string;
  printedAt: string;
  lang: Language;
  business: { name: string; phone: string; address: string; currencySymbol: string };
  paperWidthMm: number;
  /** Hisobot kimniki: "Hammasi" yoki kassir ismi. */
  scopeLabel: string;
  /** Faqat "Hammasi" bo'lganda manbalar (xona/taom/chegirma) ko'rsatiladi. */
  showSources: boolean;
  receipts: number;
  total: number;
  byMethod: Array<{ method: PaymentMethod; amount: number; count: number }>;
  roomPayments: { count: number; amount: number };
  barSales: { count: number; amount: number };
  roomRevenue: number;
  itemsRevenue: number;
  discounts: number;
  byCashier: Array<{ name: string; receipts: number; total: number }>;
  openRooms: number;
  openBalance: number;
}

interface Args {
  date: string; // YYYY-MM-DD (mahalliy)
  payments: Payment[];
  sessions: RoomSession[];
  orders: Order[];
  settings: Settings;
  lang: Language;
  cashierId?: string;
  cashierName?: string;
}

export function buildDailyReport({ date, payments, sessions, orders, settings, lang, cashierId, cashierName }: Args): DailyReport {
  const pays = payments.filter(p => p.status !== 'cancelled' && localDateKey(p.createdAt) === date && (!cashierId || p.processedBy === cashierId));
  const receipts = (list: Payment[]) => new Set(list.map(p => p.receiptNumber)).size;
  const sum = (list: Payment[]) => list.reduce((s, p) => s + p.amount, 0);

  const byMethod = (['cash', 'card', 'electronic', 'bonus'] as PaymentMethod[]).filter(method => method !== 'bonus' || pays.some(p => p.method === 'bonus')).map(method => {
    const list = pays.filter(p => p.method === method);
    return { method, amount: sum(list), count: list.length };
  });

  const roomPays = pays.filter(p => p.sessionId);
  const barPays = pays.filter(p => !p.sessionId);

  const closed = cashierId ? [] : sessions.filter(s => s.status === 'paid' && s.finalBill && s.endTime && localDateKey(s.endTime) === date);
  const roomRevenue = closed.reduce((s, x) => s + (x.finalBill?.roomAmount || 0), 0);
  const discounts = closed.reduce((s, x) => s + (x.finalBill?.discount || 0), 0);
  const itemsRevenue = closed.reduce((s, x) => s + (x.finalBill?.barAmount || 0), 0) + sum(barPays);

  const cashierMap = new Map<string, Payment[]>();
  pays.forEach(p => {
    const key = p.processedByName || '—';
    cashierMap.set(key, [...(cashierMap.get(key) || []), p]);
  });

  const open = sessions.filter(s => s.status === 'active');
  const openBalance = open.reduce((s, x) => s + calculateCombinedBill(x, orders, payments, settings).remaining, 0);

  return {
    date,
    printedAt: nowIso(),
    lang,
    business: { name: settings.businessName, phone: settings.businessPhone, address: settings.businessAddress, currencySymbol: settings.currencySymbol },
    paperWidthMm: settings.paperWidthMm,
    scopeLabel: cashierId ? (cashierName || '—') : (lang === 'uz' ? 'Hammasi' : 'Все'),
    showSources: !cashierId,
    receipts: receipts(pays),
    total: sum(pays),
    byMethod,
    roomPayments: { count: receipts(roomPays), amount: sum(roomPays) },
    barSales: { count: receipts(barPays), amount: sum(barPays) },
    roomRevenue,
    itemsRevenue,
    discounts,
    byCashier: Array.from(cashierMap.entries()).map(([name, list]) => ({ name, receipts: receipts(list), total: sum(list) })).sort((a, b) => b.total - a.total),
    openRooms: open.length,
    openBalance,
  };
}
