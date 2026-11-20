// ============================================================
// SUNDUK — Utility Functions
// ============================================================

/** 1250000 -> "1 250 000" (server va brauzerda bir xil natija beradi). */
export function formatNumber(amount: number): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  const sign = rounded < 0 ? '-' : '';
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatCurrency(amount: number, symbol = "so'm"): string {
  return `${formatNumber(amount)} ${symbol}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(dateStr: string, _lang: 'uz' | 'ru' = 'uz'): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

/** Mahalliy vaqt bo'yicha YYYY-MM-DD (UTC emas — tungi smenalar uchun muhim). */
export function localDateKey(input: Date | string | number = new Date()): string {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Soniyalarni 00:42:10 ko'rinishiga o'tkazadi. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Ketma-ket raqam: mavjud raqamlar ichidagi eng kattasidan keyingisini beradi.
 * nextNumber('ORD', ['ORD-001','ORD-007'], 3) -> 'ORD-008'
 */
export function nextNumber(prefix: string, existing: Array<string | undefined>, width = 3): string {
  let max = 0;
  for (const value of existing) {
    if (!value || !value.startsWith(`${prefix}-`)) continue;
    const n = parseInt(value.slice(prefix.length + 1), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function getTimeAgo(dateStr: string, lang: 'uz' | 'ru' = 'uz'): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (lang === 'ru') {
    if (diffSeconds < 60) return 'только что';
    if (diffMinutes < 60) return `${diffMinutes} мин. назад`;
    if (diffHours < 24) return `${diffHours} ч. назад`;
    return `${diffDays} дн. назад`;
  }

  if (diffSeconds < 60) return 'hozirgina';
  if (diffMinutes < 60) return `${diffMinutes} daqiqa oldin`;
  if (diffHours < 24) return `${diffHours} soat oldin`;
  return `${diffDays} kun oldin`;
}

export function getRoomStatusColor(status: string): string {
  switch (status) {
    case 'available': return 'text-green-400 bg-green-400/10 border-green-400/20';
    case 'occupied': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    case 'reserved': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    case 'cleaning': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
    case 'maintenance': return 'text-red-400 bg-red-400/10 border-red-400/20';
    default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
}

export function getOrderStatusColor(status: string): string {
  switch (status) {
    case 'new': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    case 'accepted': return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
    case 'preparing': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    case 'ready': return 'text-green-400 bg-green-400/10 border-green-400/20';
    case 'served': return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    case 'cancelled': return 'text-red-400 bg-red-400/10 border-red-400/20';
    default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
}

type StockInfo = { trackStock?: boolean; currentStock: number; minStock: number };

/** Qoldiq yuritiladimi: aniq belgilangan bo'lsa shu, aks holda eski qoidaga ko'ra. */
export function isStockTracked(product: StockInfo): boolean {
  return product.trackStock ?? (product.currentStock > 0 || product.minStock > 0);
}

export function isLowStock(product: StockInfo): boolean {
  return isStockTracked(product) && product.minStock > 0 && product.currentStock <= product.minStock;
}

/** Mahsulotni hozir sotib bo'ladimi (qoldiq yuritilsa — qoldiq > 0). */
export function isSellable(product: StockInfo & { isActive: boolean }): boolean {
  return product.isActive && (!isStockTracked(product) || product.currentStock > 0);
}

/** Oxirgi N kun uchun kunlik tushum (mahalliy sana bo'yicha). */
export function generateDailyChartData(payments: Array<{ createdAt: string; amount: number; status?: string }>, days = 7): Array<{ date: string; amount: number }> {
  const totals = new Map<string, number>();
  for (const p of payments) {
    if (p.status === 'cancelled') continue;
    const key = localDateKey(p.createdAt);
    totals.set(key, (totals.get(key) || 0) + p.amount);
  }
  const result: Array<{ date: string; amount: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push({ date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, amount: totals.get(localDateKey(d)) || 0 });
  }
  return result;
}
