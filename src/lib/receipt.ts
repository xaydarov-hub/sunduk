// Chek (to'langan) va Shot/hisob (to'lovgacha) ma'lumotlarini tayyorlaydi.
import { Language, Order, Payment, PaymentMethod, RoomSession, Settings, User } from '@/types';
import { calculateCombinedBill } from '@/lib/calculations';
import { useStore } from '@/lib/store';
import { claimLink } from '@/lib/loyalty/shared';

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  /** Aksiyasiz (eski) narx — faqat unitPrice'dan katta bo'lsa; chekda o'chirib ko'rsatiladi. */
  oldUnitPrice?: number;
  /** Menyudan tashqari qo'lda kiritilgan pozitsiya. */
  custom?: boolean;
}

export interface ReceiptData {
  /** 'bill' — mijozga ko'rsatiladigan hisob (shot), 'receipt' — to'lov cheki. */
  kind: 'bill' | 'receipt';
  number?: string;
  printedAt: string;
  /** Qayta chop etilgan nusxa. */
  copy?: boolean;
  lang: Language;
  business: { name: string; phone: string; address: string; footer: string; currencySymbol: string };
  paperWidthMm: number;
  showQr: boolean;
  taxRate: number;
  /** Bezak QR shakli shu qiymatdan hosil bo'ladi. */
  qrSeed: string;
  /** Haqiqiy cashback QR (Telegram bot). Bo'lsa, bezak QR o'rniga chiqadi. */
  qr?: { url: string; caption: string; sub: string };
  room?: {
    number: string;
    name: string;
    start: string;
    end?: string;
    bookedHours: number;
    overtimeHours: number;
    billedHours: number;
    hourlyPrice: number;
    amount: number;
  };
  customer?: string;
  waiter?: string;
  cashier?: string;
  lines: ReceiptLine[];
  itemsAmount: number;
  subtotal: number;
  discount: number;
  /** Xizmat haqi (ofitsiant uslugasi) — jamiga qo'shilgan. */
  service?: { rate: number; amount: number };
  total: number;
  payments: Array<{ method: PaymentMethod; amount: number }>;
  paid: number;
  remaining: number;
  /** Naqd to'lovda qaytim (faqat to'lov paytidagi chek uchun). */
  change?: number;
}

/** Sodiqlik yoqilgan bo'lsa, chek uchun haqiqiy QR (Telegram bot havolasi) tayyorlaydi. */
function loyaltyQr(claimCode: string | undefined, lang: Language): ReceiptData['qr'] {
  const cfg = useStore.getState().loyalty;
  if (!cfg?.enabled || !cfg.botUsername || !claimCode) return undefined;
  const percent = cfg.tiers[0]?.percent ?? 3;
  return {
    url: claimLink(cfg.botUsername, claimCode),
    caption: lang === 'uz' ? `QR ni skanerlang — ${percent}% cashback oling` : `Сканируйте QR — получите ${percent}% кэшбэка`,
    sub: `@${cfg.botUsername.replace(/^@/, '')}`,
  };
}

function business(settings: Settings) {
  return {
    name: settings.businessName,
    phone: settings.businessPhone,
    address: settings.businessAddress,
    footer: settings.receiptFooter,
    currencySymbol: settings.currencySymbol,
  };
}

function groupByMethod(payments: Payment[]): Array<{ method: PaymentMethod; amount: number }> {
  const map = new Map<PaymentMethod, number>();
  payments.forEach(p => map.set(p.method, (map.get(p.method) || 0) + p.amount));
  return Array.from(map.entries()).map(([method, amount]) => ({ method, amount }));
}

interface SessionReceiptArgs {
  kind: 'bill' | 'receipt';
  session: RoomSession;
  orders: Order[];
  payments: Payment[];
  settings: Settings;
  users?: User[];
  lang: Language;
  /** kind === 'receipt' bo'lganda: shu chekka tegishli to'lovlar. */
  receiptNumber?: string;
  copy?: boolean;
  /** Hisobni saqlangan chegirmasiz, ko'rib chiqilayotgan chegirma bilan chiqarish uchun. */
  discount?: number;
}

export function buildSessionReceipt({ kind, session, orders, payments, settings, users = [], lang, receiptNumber, copy, discount }: SessionReceiptArgs): ReceiptData {
  const now = new Date().toISOString();
  const bill = calculateCombinedBill(session, orders, payments, settings, { discount });
  const sessionPayments = payments.filter(p => p.sessionId === session.id && p.status !== 'cancelled');
  const thisReceipt = kind === 'receipt' && receiptNumber ? sessionPayments.filter(p => p.receiptNumber === receiptNumber) : [];
  const cutoff = thisReceipt.length ? thisReceipt[0].createdAt : undefined;
  // Shu chekgacha (va shu chek bilan) to'langan summa
  const paidUpTo = cutoff ? sessionPayments.filter(p => p.createdAt <= cutoff).reduce((sum, p) => sum + p.amount, 0) : bill.totalPaid;
  const cashierId = thisReceipt[0]?.processedBy;
  const cashierName = thisReceipt[0]?.processedByName ?? (cashierId ? users.find(u => u.id === cashierId)?.name : undefined);

  return {
    kind,
    number: receiptNumber,
    printedAt: now,
    copy,
    lang,
    business: business(settings),
    paperWidthMm: settings.paperWidthMm,
    showQr: settings.showReceiptQr,
    taxRate: settings.taxRate,
    qrSeed: `${session.id}|${receiptNumber || now}`,
    qr: kind === 'receipt' ? loyaltyQr(thisReceipt.find(p => p.claimCode)?.claimCode, lang) : undefined,
    room: {
      number: session.roomNumber,
      name: session.roomName,
      start: session.startTime,
      end: session.endTime,
      bookedHours: bill.bookedHours,
      overtimeHours: bill.overtimeHours,
      billedHours: bill.billedHours,
      hourlyPrice: session.hourlyPriceSnapshot,
      amount: bill.roomAmount,
    },
    customer: session.customerName,
    waiter: session.waiterName,
    cashier: cashierName,
    lines: bill.lines.map(line => ({
      name: lang === 'uz' ? line.name : line.nameRu, quantity: line.quantity, unitPrice: line.unitPrice, total: line.total,
      ...(line.oldUnitPrice ? { oldUnitPrice: line.oldUnitPrice } : {}), ...(line.custom ? { custom: true } : {}),
    })),
    itemsAmount: bill.barAmount,
    subtotal: bill.subtotal,
    discount: bill.discount,
    service: bill.service > 0 ? { rate: bill.serviceRate, amount: bill.service } : undefined,
    total: bill.total,
    payments: kind === 'receipt' ? groupByMethod(thisReceipt.length ? thisReceipt : sessionPayments) : [],
    paid: kind === 'receipt' ? paidUpTo : bill.totalPaid,
    remaining: Math.max(0, bill.total - (kind === 'receipt' ? paidUpTo : bill.totalPaid)),
  };
}

interface BarReceiptArgs {
  order: Order;
  payment: Payment;
  /** Bir chekdagi hamma to'lovlar (cashback bilan aralash to'langanda bir nechta bo'ladi). */
  payments?: Payment[];
  settings: Settings;
  users?: User[];
  lang: Language;
  copy?: boolean;
}

/** Bar to'g'ridan-to'g'ri savdosi cheki (xonasiz). */
export function buildBarReceipt({ order, payment, payments, settings, users = [], lang, copy }: BarReceiptArgs): ReceiptData {
  const items = order.items.filter(item => !item.voided);
  const parts = payments && payments.length ? payments : [payment];
  const total = parts.reduce((sum, p) => sum + p.amount, 0);
  const itemsAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);
  return {
    kind: 'receipt',
    number: payment.receiptNumber,
    printedAt: new Date().toISOString(),
    copy,
    lang,
    business: business(settings),
    paperWidthMm: settings.paperWidthMm,
    showQr: settings.showReceiptQr,
    taxRate: settings.taxRate,
    qrSeed: `${order.id}|${payment.receiptNumber}`,
    qr: loyaltyQr(parts.find(p => p.claimCode)?.claimCode, lang),
    cashier: payment.processedByName ?? users.find(u => u.id === payment.processedBy)?.name,
    lines: items.map(item => ({
      name: lang === 'uz' ? item.productName : item.productNameRu, quantity: item.quantity, unitPrice: item.unitPrice, total: item.totalPrice,
      ...(item.oldUnitPrice && item.oldUnitPrice > item.unitPrice ? { oldUnitPrice: item.oldUnitPrice } : {}), ...(item.custom ? { custom: true } : {}),
    })),
    itemsAmount,
    subtotal: itemsAmount,
    discount: 0,
    total,
    payments: groupByMethod(parts),
    paid: total,
    remaining: 0,
  };
}

/** Chop etishdan oldin sahifa balandligini (mm) chekka moslab beradi. */
export function printReceiptElement(root: HTMLElement, paperWidthMm: number): void {
  const heightMm = Math.ceil((root.getBoundingClientRect().height * 25.4) / 96) + 3;
  const style = document.createElement('style');
  style.id = 'receipt-page-size';
  style.textContent = `@page { size: ${paperWidthMm}mm ${heightMm}mm; margin: 0; }`;
  document.head.appendChild(style);
  const cleanup = () => {
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

/** Printer sozlamalarini sinash uchun namuna chek (haqiqiy ma'lumot yozilmaydi). */
export function buildSampleReceipt(settings: Settings, lang: Language): ReceiptData {
  const price = 150000;
  const now = Date.now();
  const lines: ReceiptLine[] = [
    { name: 'Namuna mahsulot', quantity: 4, unitPrice: 25000, total: 100000, oldUnitPrice: 30000 },
    { name: 'Namuna taom', quantity: 2, unitPrice: 35000, total: 70000 },
    { name: 'Jarima (namuna)', quantity: 1, unitPrice: 50000, total: 50000, custom: true },
  ];
  const itemsAmount = lines.reduce((sum, line) => sum + line.total, 0);
  const subtotal = 2 * price + itemsAmount;
  const discount = 20000;
  const rate = settings.serviceRate > 0 ? settings.serviceRate : 0;
  const serviceBase = settings.serviceBase === 'items' ? itemsAmount * ((subtotal - discount) / subtotal) : subtotal - discount;
  const service = rate > 0 ? Math.round((serviceBase * rate) / 100) : 0;
  const total = subtotal - discount + service;
  return {
    kind: 'receipt', number: 'RCP-00000', printedAt: new Date(now).toISOString(), lang,
    business: business(settings),
    paperWidthMm: settings.paperWidthMm, showQr: settings.showReceiptQr, taxRate: settings.taxRate, qrSeed: 'test-receipt',
    room: { number: 'VIP 01', name: 'Namuna xona', start: new Date(now - 2 * 3600 * 1000).toISOString(), end: new Date(now).toISOString(), bookedHours: 2, overtimeHours: 0, billedHours: 2, hourlyPrice: price, amount: 2 * price },
    customer: 'Sinov', waiter: 'Ofitsiant', cashier: 'Kassir',
    lines,
    itemsAmount, subtotal, discount,
    service: service > 0 ? { rate, amount: service } : undefined,
    total,
    payments: [{ method: 'cash', amount: 300000 }, { method: 'card', amount: total - 300000 }], paid: total, remaining: 0,
  };
}
