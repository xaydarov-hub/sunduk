// Chek (to'langan) va Shot/hisob (to'lovgacha) ma'lumotlarini tayyorlaydi.
import { Language, Order, Payment, PaymentMethod, RoomSession, Settings, User } from '@/types';
import { calculateCombinedBill } from '@/lib/calculations';

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
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
  total: number;
  payments: Array<{ method: PaymentMethod; amount: number }>;
  paid: number;
  remaining: number;
  /** Naqd to'lovda qaytim (faqat to'lov paytidagi chek uchun). */
  change?: number;
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
    lines: bill.lines.map(line => ({ name: lang === 'uz' ? line.name : line.nameRu, quantity: line.quantity, unitPrice: line.unitPrice, total: line.total })),
    itemsAmount: bill.barAmount,
    subtotal: bill.subtotal,
    discount: bill.discount,
    total: bill.total,
    payments: kind === 'receipt' ? groupByMethod(thisReceipt.length ? thisReceipt : sessionPayments) : [],
    paid: kind === 'receipt' ? paidUpTo : bill.totalPaid,
    remaining: Math.max(0, bill.total - (kind === 'receipt' ? paidUpTo : bill.totalPaid)),
  };
}

interface BarReceiptArgs {
  order: Order;
  payment: Payment;
  settings: Settings;
  users?: User[];
  lang: Language;
  copy?: boolean;
}

/** Bar to'g'ridan-to'g'ri savdosi cheki (xonasiz). */
export function buildBarReceipt({ order, payment, settings, users = [], lang, copy }: BarReceiptArgs): ReceiptData {
  const items = order.items.filter(item => !item.voided);
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
    cashier: payment.processedByName ?? users.find(u => u.id === payment.processedBy)?.name,
    lines: items.map(item => ({ name: lang === 'uz' ? item.productName : item.productNameRu, quantity: item.quantity, unitPrice: item.unitPrice, total: item.totalPrice })),
    itemsAmount,
    subtotal: itemsAmount,
    discount: 0,
    total: payment.amount,
    payments: [{ method: payment.method, amount: payment.amount }],
    paid: payment.amount,
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
