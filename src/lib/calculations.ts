import { Order, Payment, RoomSession, Settings } from '@/types';
import { nowMs } from '@/lib/clock';

export type BillingSettings = Pick<Settings, 'overtimeBilling' | 'overtimeGraceMinutes'>;

export const DEFAULT_BILLING: BillingSettings = { overtimeBilling: true, overtimeGraceMinutes: 10 };

export interface RoomCharge {
  elapsedSeconds: number;
  bookedHours: number;
  bookedSeconds: number;
  /** Manfiy bo'lsa — belgilangan vaqt tugagan. */
  remainingSeconds: number;
  overtimeSeconds: number;
  /** Bepul daqiqalardan keyin hisoblangan qo'shimcha soatlar. */
  overtimeHours: number;
  billedHours: number;
  hourlyPrice: number;
  roomAmount: number;
  isOvertime: boolean;
  /** 0..1 (vaqt o'tgan ulushi), oshib ketsa 1 dan katta bo'lmaydi. */
  progress: number;
}

function toMs(value: number | string): number {
  return typeof value === 'number' ? value : new Date(value).getTime();
}

/**
 * Xona narxi = (belgilangan soatlar + qo'shimcha soatlar) × soatlik narx.
 * Qo'shimcha soat faqat belgilangan vaqtdan keyin bepul daqiqalar (grace) tugagach,
 * har boshlangan soat uchun hisoblanadi.
 */
export function calculateRoomCharge(
  session: Pick<RoomSession, 'startTime' | 'endTime' | 'bookedHours' | 'hourlyPriceSnapshot'>,
  billing: BillingSettings = DEFAULT_BILLING,
  at: number | string = nowMs(),
): RoomCharge {
  const startMs = new Date(session.startTime).getTime();
  const endMs = session.endTime ? new Date(session.endTime).getTime() : toMs(at);
  const elapsedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const bookedHours = Math.max(1, Math.floor(session.bookedHours || 1));
  const bookedSeconds = bookedHours * 3600;
  const remainingSeconds = bookedSeconds - elapsedSeconds;
  const overtimeSeconds = Math.max(0, -remainingSeconds);
  const chargeable = Math.max(0, overtimeSeconds - Math.max(0, billing.overtimeGraceMinutes) * 60);
  const overtimeHours = billing.overtimeBilling ? Math.ceil(chargeable / 3600) : 0;
  const billedHours = bookedHours + overtimeHours;
  return {
    elapsedSeconds,
    bookedHours,
    bookedSeconds,
    remainingSeconds,
    overtimeSeconds,
    overtimeHours,
    billedHours,
    hourlyPrice: session.hourlyPriceSnapshot,
    roomAmount: billedHours * session.hourlyPriceSnapshot,
    isOvertime: remainingSeconds < 0,
    progress: Math.min(1, elapsedSeconds / bookedSeconds),
  };
}

export interface BillLine {
  key: string;
  productId: string;
  name: string;
  nameRu: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/** Sessiyadagi bekor qilinmagan buyurtmalar pozitsiyalari (bir xil mahsulot yig'iladi). */
export function sessionBillLines(sessionId: string, orders: Order[]): BillLine[] {
  const map = new Map<string, BillLine>();
  for (const order of orders) {
    if (order.sessionId !== sessionId || order.status === 'cancelled' || order.cancelledAt) continue;
    for (const item of order.items) {
      if (item.voided) continue;
      const key = `${item.productId}@${item.unitPrice}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.total += item.totalPrice;
      } else {
        map.set(key, {
          key,
          productId: item.productId,
          name: item.productName,
          nameRu: item.productNameRu,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.totalPrice,
        });
      }
    }
  }
  return Array.from(map.values());
}

export interface CombinedBill extends RoomCharge {
  lines: BillLine[];
  barAmount: number;
  subtotal: number;
  discount: number;
  total: number;
  totalPaid: number;
  remaining: number;
}

export interface BillOptions {
  /** Sessiyadagi saqlangan chegirma o'rniga ko'rib chiqish uchun vaqtincha qiymat. */
  discount?: number;
  at?: number | string;
}

/**
 * Xona + bar hisobi. To'langan sessiya uchun saqlangan yakuniy (muzlatilgan) hisob ishlatiladi.
 */
export function calculateCombinedBill(
  session: RoomSession,
  orders: Order[],
  payments: Payment[],
  billing: BillingSettings = DEFAULT_BILLING,
  options: BillOptions = {},
): CombinedBill {
  const charge = calculateRoomCharge(session, billing, options.at ?? nowMs());
  const lines = sessionBillLines(session.id, orders);
  // Jami to'lov va taomlar summasi sessiya hujjatida tranzaksiya bilan yuritiladi (eng ishonchli manba)
  const totalPaid = session.paidTotal ?? payments
    .filter(payment => payment.sessionId === session.id && payment.status !== 'cancelled')
    .reduce((sum, payment) => sum + payment.amount, 0);

  if (session.finalBill) {
    const snap = session.finalBill;
    return {
      ...charge,
      billedHours: snap.billedHours,
      overtimeHours: snap.overtimeHours,
      roomAmount: snap.roomAmount,
      lines,
      barAmount: snap.barAmount,
      subtotal: snap.roomAmount + snap.barAmount,
      discount: snap.discount,
      total: snap.total,
      totalPaid,
      remaining: Math.max(0, snap.total - totalPaid),
    };
  }

  const barAmount = session.itemsTotal ?? lines.reduce((sum, line) => sum + line.total, 0);
  const subtotal = charge.roomAmount + barAmount;
  const discount = Math.min(subtotal, Math.max(0, Math.round(options.discount ?? session.discount ?? 0)));
  const total = subtotal - discount;
  return { ...charge, lines, barAmount, subtotal, discount, total, totalPaid, remaining: Math.max(0, total - totalPaid) };
}

/** To'langan/yopilgan hisobdagi yoki to'langan savdodagi buyurtmani o'zgartirib (bekor qilib) bo'lmaydi. */
export function isOrderLocked(order: Order, sessions: RoomSession[], payments: Payment[]): boolean {
  if (order.status === 'cancelled') return true;
  if (order.sessionId) {
    const session = sessions.find(s => s.id === order.sessionId);
    return !!session && session.status !== 'active';
  }
  return payments.some(p => p.orderId === order.id && p.status !== 'cancelled');
}

export function snapshotBill(bill: CombinedBill): NonNullable<RoomSession['finalBill']> {
  return {
    billedHours: bill.billedHours,
    overtimeHours: bill.overtimeHours,
    roomAmount: bill.roomAmount,
    barAmount: bill.barAmount,
    discount: bill.discount,
    total: bill.total,
  };
}
