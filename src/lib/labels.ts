// Holatlar, rollar va to'lov usullarining ikki tildagi nomlari.
import { Language, OrderStatus, PaymentMethod, RoomStatus, UserRole } from '@/types';

type Pair = { uz: string; ru: string };
const pick = (pair: Pair, lang: Language) => pair[lang];

const roomStatus: Record<RoomStatus, Pair> = {
  available: { uz: 'Bo‘sh', ru: 'Свободна' },
  occupied: { uz: 'Band', ru: 'Занята' },
  reserved: { uz: 'Bron qilingan', ru: 'Забронирована' },
  cleaning: { uz: 'Tozalanmoqda', ru: 'Уборка' },
  maintenance: { uz: 'Ta’mirda', ru: 'На ремонте' },
};

const orderStatus: Record<OrderStatus, Pair> = {
  new: { uz: 'Yangi', ru: 'Новый' },
  accepted: { uz: 'Qabul qilindi', ru: 'Принят' },
  preparing: { uz: 'Tayyorlanmoqda', ru: 'Готовится' },
  ready: { uz: 'Tayyor', ru: 'Готов' },
  served: { uz: 'Yetkazildi', ru: 'Выдан' },
  cancelled: { uz: 'Bekor qilingan', ru: 'Отменён' },
};

const paymentMethod: Record<PaymentMethod, Pair> = {
  cash: { uz: 'Naqd', ru: 'Наличные' },
  card: { uz: 'Karta', ru: 'Карта' },
  electronic: { uz: 'Elektron', ru: 'Электронно' },
};

const role: Record<UserRole, Pair> = {
  admin: { uz: 'Admin', ru: 'Админ' },
  bar: { uz: 'Bar / Kassa', ru: 'Бар / Касса' },
  waiter: { uz: 'Ofitsiant', ru: 'Официант' },
};

const bookingStatus: Record<string, Pair> = {
  pending: { uz: 'Kutilmoqda', ru: 'Ожидает' },
  confirmed: { uz: 'Tasdiqlangan', ru: 'Подтверждена' },
  cancelled: { uz: 'Bekor qilingan', ru: 'Отменена' },
  completed: { uz: 'Yakunlangan', ru: 'Завершена' },
};

const expenseCategory: Record<string, Pair> = {
  salary: { uz: 'Maosh', ru: 'Зарплата' },
  utilities: { uz: 'Kommunal', ru: 'Коммунальные' },
  rent: { uz: 'Ijara', ru: 'Аренда' },
  supplies: { uz: 'Xo‘jalik', ru: 'Хозтовары' },
  maintenance: { uz: 'Ta’mirlash', ru: 'Ремонт' },
  marketing: { uz: 'Marketing', ru: 'Маркетинг' },
  other: { uz: 'Boshqa', ru: 'Другое' },
};

const inventoryType: Record<string, Pair> = {
  in: { uz: 'Kirim', ru: 'Приход' },
  out: { uz: 'Chiqim', ru: 'Расход' },
  waste: { uz: 'Yaroqsiz', ru: 'Порча' },
  inventory: { uz: 'Inventarizatsiya', ru: 'Инвентаризация' },
  return: { uz: 'Qaytarish', ru: 'Возврат' },
};

export const roomStatusLabel = (s: RoomStatus, lang: Language) => pick(roomStatus[s], lang);
export const orderStatusLabel = (s: OrderStatus, lang: Language) => pick(orderStatus[s], lang);
export const paymentMethodLabel = (m: PaymentMethod, lang: Language) => pick(paymentMethod[m], lang);
export const roleLabel = (r: UserRole, lang: Language) => pick(role[r], lang);
export const bookingStatusLabel = (s: string, lang: Language) => (bookingStatus[s] ? pick(bookingStatus[s], lang) : s);
export const expenseCategoryLabel = (c: string, lang: Language) => (expenseCategory[c] ? pick(expenseCategory[c], lang) : c);
export const inventoryTypeLabel = (t: string, lang: Language) => (inventoryType[t] ? pick(inventoryType[t], lang) : t);
export const EXPENSE_CATEGORIES = Object.keys(expenseCategory);
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'electronic'];

/** Xona holati uchun rang sinflari (qora fon). */
export const roomStatusTone: Record<RoomStatus, { badge: string; ring: string; dot: string }> = {
  available: { badge: 'bg-green-500/15 text-green-400 border-green-500/30', ring: 'border-green-500/30', dot: 'bg-green-400' },
  occupied: { badge: 'bg-gold-500/15 text-gold-400 border-gold-500/30', ring: 'border-gold-500/40', dot: 'bg-gold-400' },
  reserved: { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30', ring: 'border-blue-500/30', dot: 'bg-blue-400' },
  cleaning: { badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30', ring: 'border-purple-500/30', dot: 'bg-purple-400' },
  maintenance: { badge: 'bg-red-500/15 text-red-400 border-red-500/30', ring: 'border-red-500/30', dot: 'bg-red-400' },
};

export const orderStatusTone: Record<OrderStatus, string> = {
  new: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  accepted: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  preparing: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  ready: 'border-green-500/40 bg-green-500/15 text-green-300',
  served: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
  cancelled: 'border-red-500/30 bg-red-500/10 text-red-300',
};
